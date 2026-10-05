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
import random
import re
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage.runs import list_runs_for_city

router = APIRouter(prefix='/api/v1/chat', tags=['chat'])

GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
INTENT_MODEL = os.getenv('GEMINI_INTENT_MODEL', 'gemini-3.1-flash-lite')
INSIGHT_MODEL = os.getenv('GEMINI_INSIGHT_MODEL', 'gemini-3.8-flash')

# Agent names, shown as badges in the UI
AGENT_INTENT = 'Gemini (intent)'
AGENT_INTENT_FALLBACK = 'Keyword parser (intent)'
AGENT_DATA = 'Sahab AI pipeline (data)'
AGENT_INSIGHT = 'Gemini (insight)'
AGENT_INSIGHT_FALLBACK = 'Template (insight)'
AGENT_LINKS = 'Link Builder'

# One representative city per Arab League member state (two for the UAE), with an
# approximate [west, south, east, north] box. The UTM EPSG code is derived from the
# box, so it cannot drift out of sync with the coordinates.
ARAB_CITIES = {
    'Abu Dhabi':   {'bbox': [54.28, 24.38, 54.55, 24.58], 'country': 'UAE'},
    'Dubai':       {'bbox': [55.10, 25.00, 55.50, 25.35], 'country': 'UAE'},
    'Riyadh':      {'bbox': [46.55, 24.55, 46.85, 24.85], 'country': 'Saudi Arabia'},
    'Cairo':       {'bbox': [31.15, 29.95, 31.40, 30.15], 'country': 'Egypt'},
    'Muscat':      {'bbox': [58.10, 23.40, 58.70, 23.80], 'country': 'Oman'},
    'Amman':       {'bbox': [35.80, 31.85, 36.10, 32.10], 'country': 'Jordan'},
    'Casablanca':  {'bbox': [-7.75, 33.45, -7.45, 33.70], 'country': 'Morocco'},
    'Doha':        {'bbox': [51.40, 25.20, 51.65, 25.40], 'country': 'Qatar'},
    'Kuwait City': {'bbox': [47.85, 29.30, 48.10, 29.50], 'country': 'Kuwait'},
    'Manama':      {'bbox': [50.50, 26.15, 50.65, 26.30], 'country': 'Bahrain'},
    'Baghdad':     {'bbox': [44.25, 33.25, 44.55, 33.45], 'country': 'Iraq'},
    'Beirut':      {'bbox': [35.45, 33.83, 35.60, 33.93], 'country': 'Lebanon'},
    'Algiers':     {'bbox': [3.00, 36.65, 3.20, 36.85], 'country': 'Algeria'},
    'Tunis':       {'bbox': [10.10, 36.75, 10.30, 36.90], 'country': 'Tunisia'},
    'Tripoli':     {'bbox': [13.10, 32.80, 13.30, 32.95], 'country': 'Libya'},
    'Khartoum':    {'bbox': [32.45, 15.50, 32.65, 15.65], 'country': 'Sudan'},
    'Sanaa':       {'bbox': [44.15, 15.30, 44.35, 15.45], 'country': 'Yemen'},
    'Damascus':    {'bbox': [36.20, 33.45, 36.40, 33.60], 'country': 'Syria'},
    'Ramallah':    {'bbox': [35.17, 31.88, 35.25, 31.93], 'country': 'Palestine'},
    'Nouakchott':  {'bbox': [-16.05, 18.02, -15.90, 18.15], 'country': 'Mauritania'},
    'Mogadishu':   {'bbox': [45.28, 2.00, 45.40, 2.10], 'country': 'Somalia'},
    'Djibouti':    {'bbox': [43.10, 11.54, 43.20, 11.62], 'country': 'Djibouti'},
    'Moroni':      {'bbox': [43.22, -11.73, 43.30, -11.66], 'country': 'Comoros'},
}
# Rabat is Morocco's capital; Casablanca is kept because it is the larger city.
ARAB_CITIES['Rabat'] = {'bbox': [-6.95, 33.93, -6.75, 34.07], 'country': 'Morocco'}


def utm_epsg(bbox: list[float]) -> int:
    """WGS84 / UTM zone EPSG code for the centre of a [W, S, E, N] box."""
    lon = (bbox[0] + bbox[2]) / 2
    lat = (bbox[1] + bbox[3]) / 2
    zone = int(math.floor((lon + 180) / 6)) + 1
    return (32600 if lat >= 0 else 32700) + zone


for _c in ARAB_CITIES.values():
    _c['epsg'] = utm_epsg(_c['bbox'])

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


def gemini_generate(model: str, messages: list[dict], system: str = '',
                    json_mode: bool = False, max_tokens: int = 1024,
                    temperature: float = 0.4) -> str:
    key = os.getenv('GEMINI_API_KEY')
    if not key:
        raise GeminiError('GEMINI_API_KEY is not set on the server.')
    contents = _to_contents(messages)
    if not contents:
        raise GeminiError('No message content to send.')
    gen_cfg = {'maxOutputTokens': max_tokens, 'temperature': temperature}
    if json_mode:
        gen_cfg['responseMimeType'] = 'application/json'
    body = {'contents': contents, 'generationConfig': gen_cfg}
    if system:
        body['systemInstruction'] = {'parts': [{'text': system}]}
    try:
        r = requests.post(GEMINI_URL.format(model=model), json=body, timeout=60,
                          headers={'x-goog-api-key': key, 'Content-Type': 'application/json'})
    except requests.RequestException as exc:
        raise GeminiError(f'Could not reach the Gemini API: {exc}') from exc
    if r.status_code != 200:
        try:
            detail = r.json().get('error', {}).get('message', r.text)
        except ValueError:
            detail = r.text
        raise GeminiError(f'Gemini API returned {r.status_code} for {model}: {detail[:300]}')
    try:
        parts = r.json()['candidates'][0]['content']['parts']
        text = ''.join(p.get('text', '') for p in parts).strip()
    except (KeyError, IndexError, ValueError) as exc:
        raise GeminiError('Gemini returned no text (the response may have been blocked).') from exc
    if not text:
        raise GeminiError('Gemini returned an empty response.')
    return text


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
    elif action or any(w in low for w in ('heat', 'block', 'hot', 'risk', 'temperature', 'cool')):
        qtype = 'full_analysis'  # a heat question without a city: the endpoint will ask which one
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
        raw = gemini_generate(INTENT_MODEL, [{'role': 'user', 'content': f'User message: "{message}"'}],
                              system=_intent_system_prompt(), json_mode=True,
                              max_tokens=600, temperature=0.0)
        raw = re.sub(r'^```(?:json)?|```$', '', raw.strip(), flags=re.M).strip()
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError('not an object')
        return _normalise_intent(data), AGENT_INTENT, None
    except (GeminiError, ValueError) as exc:
        return _normalise_intent(_keyword_intent(message)), AGENT_INTENT_FALLBACK, str(exc)


# ------------------------------------------------------------- Agent 2: data
def _demo_blocks(city: str, bbox: list[float], n: int = 20) -> list[dict]:
    """Clearly-labelled simulated blocks placed inside the city's own bounding box."""
    rng = random.Random(city)
    blocks = []
    for _ in range(n):
        risk = round(rng.uniform(0.45, 0.96), 3)
        action = rng.choices(['Tree planting', 'Cool roofs', 'Tree planting + Cool roofs'],
                             weights=[0.45, 0.2, 0.35])[0]
        cool = {'Tree planting': 1.8, 'Cool roofs': 1.2, 'Tree planting + Cool roofs': 3.0}[action]
        blocks.append({
            'city': city,
            'lat': round(rng.uniform(bbox[1], bbox[3]), 5),
            'lon': round(rng.uniform(bbox[0], bbox[2]), 5),
            'risk_score': risk, 'action': action,
            'est_cooling_c': round(cool * rng.uniform(0.8, 1.2), 2),
            'cooling_ci_c': round(rng.uniform(0.4, 0.9), 2),
            'dominant_material': rng.choice(['Bare soil', 'Concrete/pavement', 'Dark asphalt', 'Stressed veg']),
            'veg_fraction': round(rng.uniform(0.02, 0.2), 3),
            'asphalt_fraction': round(rng.uniform(0.05, 0.4), 3),
        })
    blocks.sort(key=lambda b: b['risk_score'], reverse=True)
    for i, b in enumerate(blocks, 1):
        b['rank'] = i
    return blocks


def _action_matches(label: str, wanted: str | None) -> bool:
    if not wanted:
        return True
    low = label.lower()
    if wanted == 'both':
        return '+' in low
    return wanted.replace('_', ' ') in low


def load_city_data(city: str, bbox: list[float], action_filter: str | None, min_risk: float) -> dict:
    """Reuse the latest completed run for a city, otherwise return labelled demo data."""
    completed = [r for r in list_runs_for_city(city) if r.get('status') == 'complete']
    if completed:
        latest = completed[0]
        blocks = []
        path = latest.get('blocks_path') or ''
        if path and os.path.exists(path):
            with open(path) as f:
                blocks = json.load(f)
        top = [b for b in blocks if b['risk_score'] >= min_risk and _action_matches(b['action'], action_filter)][:20]
        return {'city': city, 'run_id': latest['run_id'], 'is_demo': False,
                'summary': latest.get('summary') or {}, 'top_blocks': top[:5],
                'matching_blocks': len([b for b in blocks if b['risk_score'] >= min_risk
                                        and _action_matches(b['action'], action_filter)])}

    blocks = _demo_blocks(city, bbox)
    top = [b for b in blocks if b['risk_score'] >= min_risk and _action_matches(b['action'], action_filter)]
    counts: dict[str, int] = {}
    for b in blocks:
        counts[b['action']] = counts.get(b['action'], 0) + 1
    return {
        'city': city, 'run_id': None, 'is_demo': True,
        'summary': {
            'city_name': city, 'total_blocks': len(blocks),
            'high_risk_count': len([b for b in blocks if b['risk_score'] > 0.7]),
            'action_counts': counts,
            'note': 'Simulated demo data. No satellite analysis has been run for this city yet.',
        },
        'top_blocks': top[:5], 'matching_blocks': len(top),
    }


# ---------------------------------------------------------- Agent 3: insight
INSIGHT_SYSTEM = (
    "You are Sahab AI's urban heat expert. You explain satellite-derived heat risk results "
    'in plain language for municipal planners and policymakers across the Arab world. '
    'Be specific about block numbers, cooling estimates and material types. Always mention '
    'the uncertainty in cooling estimates. Keep responses under 200 words. End with two '
    'actionable recommendations. Use only the numbers in the data you are given. If the data '
    'is marked as demo or simulated, say so plainly in the first sentence and do not present '
    'its numbers as real findings. Plain text only, no markdown headings.'
)
GENERAL_SYSTEM = (
    "You are Sahab AI's urban heat expert for municipal planners across the Arab world. "
    'Answer the question clearly in under 150 words, plain text, and suggest one next step '
    'in the Sahab AI dashboard.'
)


def _template_narrative(message: str, datas: list[dict]) -> str:
    parts = []
    for d in datas:
        s = d['summary']
        tag = 'Simulated demo data' if d['is_demo'] else 'Latest satellite analysis'
        line = f"{d['city']} ({tag}): {s.get('total_blocks', '?')} blocks, {s.get('high_risk_count', '?')} high risk."
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
        payload = [{
            'city': d['city'], 'is_demo': d['is_demo'], 'summary': d['summary'],
            'blocks_matching_filter': d['matching_blocks'], 'top_blocks': d['top_blocks'],
        } for d in datas]
        msgs = history + [{'role': 'user', 'content':
                           f'User asked: "{message}"\n\nData:\n{json.dumps(payload, indent=1)}\n\n'
                           'Write a clear response for a city planner.'}]
        system = INSIGHT_SYSTEM
    try:
        return gemini_generate(INSIGHT_MODEL, msgs, system=system, max_tokens=1024), AGENT_INSIGHT, None
    except GeminiError as exc:
        if is_explanation:
            return ('The explanation agent is unavailable right now. Try asking about a specific '
                    'city, for example "Analyze heat risk in Dubai".'), AGENT_INSIGHT_FALLBACK, str(exc)
        return _template_narrative(message, datas), AGENT_INSIGHT_FALLBACK, str(exc)


# ------------------------------------------------------------ Agent 4: links
def build_links(city: str, bbox: list[float], epsg: int, run_id: str | None,
                action_filter: str | None, min_risk: float, has_blocks: bool) -> list[dict]:
    links = []
    base = {'city': city}
    if run_id:
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
    run_q = {**base, 'bbox': ','.join(str(round(x, 4)) for x in bbox), 'epsg': epsg}
    links.append({'label': f'Run fresh analysis for {city}', 'url': f'/run?{urlencode(run_q)}', 'type': 'run'})
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
                         'for example Dubai, Riyadh, Cairo or Muscat.',
            'intent': intent, 'data': None, 'extra_data': [], 'links': [],
            'agents_used': agents,
            'followup_questions': ['Analyze heat risk in Dubai', 'Where should Muscat plant trees first?'],
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
    primary = load_city_data(city, bbox, af, mr)
    others = []
    if qtype == 'comparison':
        for oc in intent['other_cities']:
            others.append(load_city_data(oc, ARAB_CITIES[oc]['bbox'], af, mr))
    agents.append(AGENT_DATA)

    text, ins_agent, warn2 = insight(message, history, [primary] + others, False)
    if warn2:
        warnings.append(warn2)
    agents.append(ins_agent)

    links = build_links(city, bbox, epsg, primary['run_id'], af, mr, bool(primary['top_blocks']))
    agents.append(AGENT_LINKS)

    followups = intent['followup_questions'] or [
        f'Which blocks in {city} need tree planting most urgently?',
        f'How uncertain are the cooling estimates for {city}?',
    ]
    return {
        'narrative': text, 'intent': intent, 'data': primary, 'extra_data': others,
        'links': links, 'agents_used': agents, 'followup_questions': followups,
        'warnings': warnings,
    }
