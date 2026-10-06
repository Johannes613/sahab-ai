"""Agentic chat: Intent Parser -> Data Agent -> Insight Agent -> Link Builder.

Both language agents use the Google Gemini API (server side only, so the key never
reaches the browser). Calls go straight to the REST ``generateContent`` endpoint
with ``requests``: the ``google-generativeai`` SDK reached end of life in
November 2025 and ``gemini-2.0-flash`` has been shut down, so the models are
configurable through environment variables.
"""
import json
import math
import os
import threading
import re
import time
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage.runs import list_runs_for_city, create_run
from pipeline.runner import run_pipeline
from pipeline.scene_index import suggest_pair, get_scene

router = APIRouter(prefix='/api/v1/chat', tags=['chat'])

GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
INTENT_MODEL = os.getenv('GEMINI_INTENT_MODEL', 'gemini-flash-latest')
INSIGHT_MODEL = os.getenv('GEMINI_INSIGHT_MODEL', 'gemini-flash-latest')
# used only when the primary model is overloaded or too slow
FALLBACK_MODEL = os.getenv('GEMINI_FALLBACK_MODEL', 'gemini-flash-lite-latest')

# Agent names, shown as badges in the UI
AGENT_INTENT = 'Gemini (intent)'
AGENT_INTENT_LITE = 'Gemini Flash-Lite (intent)'
AGENT_INTENT_FALLBACK = 'Keyword parser (intent)'
AGENT_DATA = 'Sahab AI pipeline (data)'
AGENT_INSIGHT = 'Gemini (insight)'
AGENT_INSIGHT_LITE = 'Gemini Flash-Lite (insight)'
AGENT_INSIGHT_FALLBACK = 'Template (insight)'
AGENT_LINKS = 'Link Builder'

from pipeline.cities import ARAB_CITIES, utm_epsg  # noqa: E402

CITY_LOOKUP = {name.lower(): name for name in ARAB_CITIES}
QUERY_TYPES = {'full_analysis', 'heat_risk_only', 'intervention_only', 'comparison', 'explanation'}
ACTION_FILTERS = {'tree_planting', 'cool_roofs', 'both'}


# --------------------------------------------------------------------- schemas
class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    session_id: str = ''


class GeminiRequest(BaseModel):
    messages: list[dict]
    system: str = ''


# ---------------------------------------------------------------- Gemini calls
class GeminiError(Exception):
    pass


def _to_contents(messages: list[dict]) -> list[dict]:
    """[{role: user|assistant, content}] -> Gemini contents (roles user/model, must start with user)."""
    contents = []
    for m in messages:
        text = (m.get('content') or '').strip()
        if not text:
            continue
        role = 'user' if m.get('role') == 'user' else 'model'
        if contents and contents[-1]['role'] == role:  # merge consecutive same-role turns
            contents[-1]['parts'][0]['text'] += '\n\n' + text
        else:
            contents.append({'role': role, 'parts': [{'text': text}]})
    while contents and contents[0]['role'] != 'user':
        contents.pop(0)
    return contents


RETRYABLE = (429, 500, 502, 503, 504)
REQUEST_TIMEOUT = 25  # seconds; a slow or overloaded model should hand over to the fallback quickly


def _gemini_once(model: str, contents: list[dict], system: str, json_mode: bool,
                 max_tokens: int, temperature: float, key: str) -> str:
    """One model, up to two attempts. Raises GeminiError."""
    # gemini-flash-latest is a thinking model and its thinking tokens count against
    # maxOutputTokens, so callers must leave generous headroom or answers are cut off.
    gen_cfg = {'maxOutputTokens': max_tokens, 'temperature': temperature}
    if json_mode:
        gen_cfg['responseMimeType'] = 'application/json'
    body = {'contents': contents, 'generationConfig': gen_cfg}
    if system:
        body['systemInstruction'] = {'parts': [{'text': system}]}

    last = 'no response'
    for attempt, wait in enumerate((0, 2)):
        if wait:
            time.sleep(wait)
        try:
            r = requests.post(GEMINI_URL.format(model=model), json=body, timeout=REQUEST_TIMEOUT,
                              headers={'x-goog-api-key': key, 'Content-Type': 'application/json'})
        except requests.RequestException as exc:
            last = f'could not reach the Gemini API ({type(exc).__name__})'
            continue
        if r.status_code in RETRYABLE:
            try:
                last = f'{r.status_code}: {r.json().get("error", {}).get("message", "")[:140]}'
            except ValueError:
                last = str(r.status_code)
            continue
        if r.status_code != 200:
            try:
                detail = r.json().get('error', {}).get('message', r.text)
            except ValueError:
                detail = r.text
            raise GeminiError(f'Gemini API returned {r.status_code} for {model}: {detail[:300]}')
        try:
            cand = r.json()['candidates'][0]
            text = ''.join(p.get('text', '') for p in cand['content']['parts']).strip()
        except (KeyError, IndexError, ValueError) as exc:
            raise GeminiError(f'{model} returned no text (the response may have been blocked).') from exc
        if cand.get('finishReason') == 'MAX_TOKENS':
            raise GeminiError(f'{model} ran out of output tokens before finishing.')
        if not text:
            raise GeminiError(f'{model} returned an empty response.')
        return text
    raise GeminiError(f'{model} unavailable: {last}')


def gemini_generate_ex(model: str, messages: list[dict], system: str = '',
                       json_mode: bool = False, max_tokens: int = 2048,
                       temperature: float = 0.4) -> tuple[str, str]:
    """Returns (text, model_that_answered). Tries `model`, then the fallback model."""
    key = os.getenv('GEMINI_API_KEY')
    if not key:
        raise GeminiError('GEMINI_API_KEY is not set on the server.')
    contents = _to_contents(messages)
    if not contents:
        raise GeminiError('No message content to send.')
    errors = []
    for m in dict.fromkeys([model, FALLBACK_MODEL]):   # primary first, fallback only if it fails
        try:
            return _gemini_once(m, contents, system, json_mode, max_tokens, temperature, key), m
        except GeminiError as exc:
            errors.append(str(exc))
    raise GeminiError(' | '.join(errors))


def gemini_generate(model: str, messages: list[dict], system: str = '',
                    json_mode: bool = False, max_tokens: int = 2048,
                    temperature: float = 0.4) -> str:
    return gemini_generate_ex(model, messages, system, json_mode, max_tokens, temperature)[0]


@router.post('/gemini')
def call_gemini(req: GeminiRequest):
    """Server-side proxy so the browser never sees the API key."""
    try:
        return {'content': gemini_generate(INSIGHT_MODEL, req.messages, system=req.system)}
    except GeminiError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ------------------------------------------------------------ Agent 1: intent
def _intent_system_prompt() -> str:
    cities = {n: {'country': c['country'], 'bbox': c['bbox'], 'epsg': c['epsg']}
              for n, c in ARAB_CITIES.items()}
    return (
        'You are the intent-extraction agent for Sahab AI, an urban heat risk platform for '
        'Arab League countries. Read the user message and return ONLY a JSON object, no '
        'markdown and no prose.\n\n'
        f'Known cities (use these exact names, bounding boxes [west, south, east, north] and EPSG codes):\n'
        f'{json.dumps(cities)}\n\n'
        'If the user names a city that is not listed, set "city" to that name, "country" if you '
        'know it, and give your best approximate bbox and UTM EPSG. If no city is mentioned, '
        'use null for city, country and bbox.\n\n'
        'JSON schema:\n'
        '{"city": string|null, "country": string|null, "bbox": [w,s,e,n]|null, "epsg": int|null,'
        ' "query_type": "full_analysis"|"heat_risk_only"|"intervention_only"|"comparison"|"explanation",'
        ' "action_filter": "tree_planting"|"cool_roofs"|"both"|null, "min_risk": number 0..1,'
        ' "other_cities": [string] (only for comparison, exact names from the list),'
        ' "followup_questions": [string, string], "confidence": number 0..1}\n'
        'Use "explanation" for general questions that need no city data (what is NDVI, how does '
        'cooling work). Set min_risk to about 0.7 when the user asks for the most urgent or '
        'hottest blocks, otherwise 0.'
    )


def _keyword_intent(message: str) -> dict:
    """Used when Gemini is unavailable: find a known city and a few keywords."""
    low = message.lower()
    found = [name for key, name in CITY_LOOKUP.items() if re.search(rf'\b{re.escape(key)}\b', low)]
    found.sort(key=lambda n: low.index(n.lower()))
    action = None
    if 'cool roof' in low or 'roof' in low:
        action = 'cool_roofs'
    if 'tree' in low or 'plant' in low or 'green' in low:
        action = 'both' if action else 'tree_planting'
    if 'compare' in low and len(found) >= 2:
        qtype = 'comparison'
    elif found:
        qtype = 'intervention_only' if action else 'full_analysis'
    elif low.startswith(('what', 'why', 'how does', 'how do', 'explain', 'define', 'difference',
                         'tell me about')):
        qtype = 'explanation'
    elif action or any(w in low for w in ('analy', 'show', 'which', 'where', 'hottest', 'block', 'risk')):
        qtype = 'full_analysis'  # a heat request without a city: the endpoint will ask which one
    else:
        qtype = 'explanation'
    urgent = any(w in low for w in ('urgent', 'hottest', 'highest', 'most', 'worst'))
    return {
        'city': found[0] if found else None, 'country': None, 'bbox': None, 'epsg': None,
        'query_type': qtype, 'action_filter': action, 'min_risk': 0.7 if urgent else 0.0,
        'other_cities': found[1:3], 'followup_questions': [], 'confidence': 0.4,
    }


def _normalise_intent(raw: dict) -> dict:
    """Validate whatever the model returned and fill coordinates from the trusted table."""
    intent = {
        'city': raw.get('city') or None, 'country': raw.get('country') or None,
        'bbox': None, 'epsg': None,
        'query_type': raw.get('query_type') if raw.get('query_type') in QUERY_TYPES else 'full_analysis',
        'action_filter': raw.get('action_filter') if raw.get('action_filter') in ACTION_FILTERS else None,
        'min_risk': 0.0, 'other_cities': [], 'followup_questions': [], 'confidence': 0.5,
    }
    try:
        intent['min_risk'] = min(1.0, max(0.0, float(raw.get('min_risk') or 0)))
        intent['confidence'] = min(1.0, max(0.0, float(raw.get('confidence') or 0.5)))
    except (TypeError, ValueError):
        pass
    fq = raw.get('followup_questions')
    if isinstance(fq, list):
        intent['followup_questions'] = [str(q) for q in fq if str(q).strip()][:3]
    oc = raw.get('other_cities')
    if isinstance(oc, list):
        intent['other_cities'] = [CITY_LOOKUP[c.lower()] for c in oc
                                  if isinstance(c, str) and c.lower() in CITY_LOOKUP][:2]

    known = CITY_LOOKUP.get((intent['city'] or '').lower())
    if known:  # trust our table over the model for known cities
        intent['city'] = known
        intent['country'] = ARAB_CITIES[known]['country']
        intent['bbox'] = ARAB_CITIES[known]['bbox']
        intent['epsg'] = ARAB_CITIES[known]['epsg']
    elif intent['city']:
        bb = raw.get('bbox')
        if (isinstance(bb, list) and len(bb) == 4
                and all(isinstance(v, (int, float)) for v in bb)
                and bb[0] < bb[2] and bb[1] < bb[3]
                and -180 <= bb[0] and bb[2] <= 180 and -90 <= bb[1] and bb[3] <= 90):
            intent['bbox'] = [float(v) for v in bb]
            intent['epsg'] = utm_epsg(intent['bbox'])
    return intent


def parse_intent(message: str) -> tuple[dict, str, str | None]:
    """Returns (intent, agent name, warning)."""
    try:
        raw, used = gemini_generate_ex(
            INTENT_MODEL, [{'role': 'user', 'content': f'User message: "{message}"'}],
            system=_intent_system_prompt(), json_mode=True, max_tokens=2048, temperature=0.0)
        raw = re.sub(r'^```(?:json)?|```$', '', raw.strip(), flags=re.M).strip()
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError('not an object')
        agent = AGENT_INTENT if used == INTENT_MODEL else AGENT_INTENT_LITE
        return _normalise_intent(data), agent, None
    except (GeminiError, ValueError) as exc:
        return _normalise_intent(_keyword_intent(message)), AGENT_INTENT_FALLBACK, str(exc)


# ------------------------------------------------------------- Agent 2: data
def _action_matches(b: dict, wanted: str | None) -> bool:
    if not wanted:
        return True
    return b.get('action_key') == wanted


def _start_analysis(city: str, bbox: list[float], epsg: int, pair: dict) -> str:
    """Starts a real analysis in a background thread and returns its run id."""
    payload = {
        'city_name': city, 'bbox': bbox, 'epsg': epsg,
        'scene_t1_id': pair.get('t1'), 'scene_t2_id': pair['t2'],
        'block_size': 20, 'block_size_m': 600, 'min_valid_pct': 0.15,
        'include_sentinel2': True, 'include_landsat': True,
    }
    run_id = create_run(city, payload)
    threading.Thread(target=run_pipeline, args=(run_id, payload), daemon=True).start()
    return run_id


def resolve_city(city: str, bbox: list[float], epsg: int, action_filter: str | None,
                 min_risk: float, start_if_missing: bool = True) -> dict:
    """Data agent for one city. state is one of:
    ready (completed run), pending (analysis running or just started),
    failed (latest run failed), unavailable (no open satellite scene covers the city)."""
    runs = list_runs_for_city(city)  # newest first
    base = {'city': city, 'run_id': None, 'summary': {}, 'top_blocks': [], 'matching_blocks': 0,
            'message': '', 'scene_note': ''}

    complete = [r for r in runs if r.get('status') == 'complete']
    active = [r for r in runs if r.get('status') in ('queued', 'running')]
    if active:
        r = active[0]
        return {**base, 'state': 'pending', 'run_id': r['run_id'],
                'message': f"An analysis for {city} is already running ({r.get('progress_pct', 0)}%, "
                           f"{r.get('current_step', '')})."}
    if complete:
        latest = complete[0]
        blocks = []
        path = latest.get('blocks_path') or ''
        if path and os.path.exists(path):
            with open(path) as f:
                blocks = json.load(f)
        match = [b for b in blocks if b['risk_score'] >= min_risk and _action_matches(b, action_filter)]
        return {**base, 'state': 'ready', 'run_id': latest['run_id'],
                'summary': latest.get('summary') or {}, 'top_blocks': match[:5],
                'matching_blocks': len(match)}
    if runs and runs[0].get('status') == 'failed':
        err = (runs[0].get('error') or 'unknown error').split('\n')[0]
        return {**base, 'state': 'failed', 'run_id': runs[0]['run_id'],
                'message': f"The last analysis for {city} failed: {err}"}

    pair = suggest_pair(bbox)
    if not pair['t2']:
        return {**base, 'state': 'unavailable',
                'message': f"The open Tanager catalog has no satellite scene covering {city}, so I "
                           'cannot run a real analysis there yet.'}
    scene = get_scene(pair['t2'])
    note = pair['note']
    if not start_if_missing:
        return {**base, 'state': 'unavailable', 'scene_note': note,
                'message': f'No analysis for {city} has been run yet.'}
    run_id = _start_analysis(city, bbox, epsg, pair)
    return {**base, 'state': 'pending', 'run_id': run_id, 'scene_note': note,
            'message': f"I started a satellite analysis for {city} using Tanager scene {pair['t2']} "
                       f"(acquired {scene['datetime'][:10]}). {note} It takes a few minutes, and "
                       'you can follow it below.'}


# ---------------------------------------------------------- Agent 3: insight
INSIGHT_SYSTEM = (
    "You are Sahab AI's urban heat expert. You explain satellite-derived heat risk results "
    'in plain language for municipal planners and policymakers across the Arab world. '
    'Be specific about block numbers, cooling estimates and material types. Always mention '
    'the uncertainty in cooling estimates. Keep responses under 200 words. End with two '
    'actionable recommendations. Use only the numbers in the data you are given. If the data '
    'says temperature is modelled rather than measured, or that exposure is a proxy, say so '
    'briefly. Plain text only, no markdown headings. '
    'The dashboard has exactly these features: a priority map with Risk, Materials, Temperature and Change layers; a block detail panel; a ranked table of blocks; a city history page; and a Run Analysis page. Never mention a feature that is not in this list.'
)
GENERAL_SYSTEM = (
    "You are Sahab AI's urban heat expert for municipal planners across the Arab world. "
    'Answer the question clearly in under 150 words, plain text, and suggest one next step '
    'in the Sahab AI dashboard. '
    'The dashboard has exactly these features: a priority map with Risk, Materials, Temperature and Change layers; a block detail panel; a ranked table of blocks; a city history page; and a Run Analysis page. Never mention a feature that is not in this list.'
)


def _insight_payload(d: dict) -> dict:
    s = d['summary']
    keep = ('total_blocks', 'high_risk_count', 'mean_lst', 'max_lst', 'mean_lst_delta_top20',
            'total_cooling_top20', 'top_action_counts', 'cooling_total_by_action', 'scene_t2_date',
            'scene_t1_date', 'lst_source', 'population_source', 'cooling_source', 'classes_present',
            'ndbi_lst_correlation', 'ndvi_lst_correlation', 'block_size_m')
    top = [{k: b[k] for k in ('rank', 'risk_score', 'action', 'est_cooling_c', 'cooling_ci_c',
                              'dominant_material', 'veg_fraction', 'lst_delta', 'action_rationale')
            if k in b} for b in d['top_blocks']]
    return {'city': d['city'], 'summary': {k: s[k] for k in keep if k in s},
            'blocks_matching_filter': d['matching_blocks'], 'top_blocks': top}


def _template_narrative(datas: list[dict]) -> str:
    parts = []
    for d in datas:
        s = d['summary']
        line = (f"{d['city']}: {s.get('total_blocks', '?')} blocks analyzed, "
                f"{s.get('high_risk_count', '?')} high risk, mean surface temperature {s.get('mean_lst', '?')} °C.")
        if d['top_blocks']:
            b = d['top_blocks'][0]
            line += (f" Top block #{b['rank']} (risk {b['risk_score']}): {b['action']}, "
                     f"estimated cooling {b['est_cooling_c']} ± {b['cooling_ci_c']} °C.")
        parts.append(line)
    return ' '.join(parts) + ' (The AI summary is unavailable right now, so this is a plain data readout.)'


def insight(message: str, history: list[dict], datas: list[dict], is_explanation: bool
            ) -> tuple[str, str, str | None]:
    if is_explanation:
        msgs = history + [{'role': 'user', 'content': message}]
        system = GENERAL_SYSTEM
    else:
        payload = [_insight_payload(d) for d in datas]
        msgs = history + [{'role': 'user', 'content':
                           f'User asked: "{message}"\n\nData:\n{json.dumps(payload, indent=1)}\n\n'
                           'Write a clear response for a city planner.'}]
        system = INSIGHT_SYSTEM
    try:
        text, used = gemini_generate_ex(INSIGHT_MODEL, msgs, system=system, max_tokens=4096)
        return text, (AGENT_INSIGHT if used == INSIGHT_MODEL else AGENT_INSIGHT_LITE), None
    except GeminiError as exc:
        if is_explanation:
            return ('The explanation agent is unavailable right now. Try asking about a specific '
                    'city, for example "Analyze heat risk in Riyadh".'), AGENT_INSIGHT_FALLBACK, str(exc)
        return _template_narrative(datas), AGENT_INSIGHT_FALLBACK, str(exc)


# ------------------------------------------------------------ Agent 4: links
def build_links(city: str, bbox: list[float], epsg: int, run_id: str | None, state: str,
                action_filter: str | None, min_risk: float, has_blocks: bool) -> list[dict]:
    links = []
    base = {'city': city}
    if run_id and state == 'ready':
        q = {'run_id': run_id, **base}
        if min_risk:
            q['min_risk'] = min_risk
        if action_filter:
            q['filter_action'] = action_filter
        links.append({'label': f'Open {city} risk map', 'url': f'/dashboard?{urlencode(q)}', 'type': 'dashboard'})
        if has_blocks:
            links.append({'label': 'View top priority block',
                          'url': f'/dashboard?{urlencode({"run_id": run_id, **base, "highlight_block": 1})}',
                          'type': 'block'})
        if action_filter:
            links.append({'label': f'Filter to {action_filter.replace("_", " ")} blocks',
                          'url': f'/dashboard?{urlencode({"run_id": run_id, **base, "filter_action": action_filter, "min_risk": min_risk})}',
                          'type': 'filter'})
    if run_id and state == 'pending':
        links.append({'label': 'Watch the analysis progress',
                      'url': f'/run?{urlencode({"run_id": run_id})}', 'type': 'run'})
    if state != 'unavailable':
        run_q = {**base, 'bbox': ','.join(str(round(x, 4)) for x in bbox), 'epsg': epsg}
        links.append({'label': f'Run a new analysis for {city}', 'url': f'/run?{urlencode(run_q)}', 'type': 'run'})
    return links


# ---------------------------------------------------------------- endpoint
@router.post('/message')
def handle_message(req: ChatRequest):
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail='Message is empty.')
    history = [m for m in req.history if (m.get('content') or '').strip()][-10:]

    intent, intent_agent, warn1 = parse_intent(message)
    warnings = [w for w in [warn1] if w]
    agents = [intent_agent]
    qtype = intent['query_type']

    # General question with no city: no satellite data needed
    if qtype == 'explanation' and not intent['city']:
        text, agent, warn = insight(message, history, [], True)
        if warn:
            warnings.append(warn)
        return {'narrative': text, 'intent': intent, 'data': None, 'extra_data': [], 'links': [],
                'agents_used': agents + [agent], 'followup_questions': intent['followup_questions'],
                'warnings': warnings}

    # A heat question needs a city
    if not intent['city']:
        return {
            'narrative': 'Which city should I look at? I can analyze any Arab capital or major city, '
                         'for example Riyadh, Dubai, Cairo or Muscat.',
            'intent': intent, 'data': None, 'extra_data': [], 'links': [],
            'agents_used': agents,
            'followup_questions': ['Analyze heat risk in Riyadh', 'Where should Muscat plant trees first?'],
            'warnings': warnings,
        }
    if not intent['bbox']:
        return {
            'narrative': f"I don't have coordinates for {intent['city']} yet. Open Run Analysis, draw "
                         'the area on the map and start a run, or ask about one of the listed Arab cities.',
            'intent': intent, 'data': None, 'extra_data': [],
            'links': [{'label': 'Open Run Analysis', 'url': f"/run?city={intent['city']}", 'type': 'run'}],
            'agents_used': agents, 'followup_questions': [], 'warnings': warnings,
        }

    city, bbox, epsg = intent['city'], intent['bbox'], intent['epsg']
    af, mr = intent['action_filter'], intent['min_risk']
    primary = resolve_city(city, bbox, epsg, af, mr)
    others = []
    if qtype == 'comparison':
        for oc in intent['other_cities']:
            others.append(resolve_city(oc, ARAB_CITIES[oc]['bbox'], ARAB_CITIES[oc]['epsg'], af, mr,
                                       start_if_missing=False))
    agents.append(AGENT_DATA)

    ready = [d for d in [primary] + others if d['state'] == 'ready']
    notes = [d['message'] for d in [primary] + others if d['state'] != 'ready' and d['message']]
    if ready:
        text, ins_agent, warn2 = insight(message, history, ready, False)
        if warn2:
            warnings.append(warn2)
        agents.append(ins_agent)
        if notes:
            text += '\n\n' + ' '.join(notes)
    else:
        text = ' '.join(notes) or f'No results are available for {city} yet.'

    links = build_links(city, bbox, epsg, primary['run_id'], primary['state'], af, mr,
                        bool(primary['top_blocks']))
    agents.append(AGENT_LINKS)

    followups = intent['followup_questions']
    if not followups and primary['state'] == 'ready':
        followups = [f'Which blocks in {city} need tree planting most urgently?',
                     f'How uncertain are the cooling estimates for {city}?']
    return {
        'narrative': text, 'intent': intent, 'data': primary, 'extra_data': others,
        'links': links, 'agents_used': agents, 'followup_questions': followups,
        'warnings': warnings,
    }
