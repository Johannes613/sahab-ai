import numpy as np
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.metrics import classification_report, cohen_kappa_score
import xgboost as xgb

CLASS_NAMES = ['Water', 'Healthy veg', 'Stressed veg',
               'Dark asphalt', 'Concrete/pavement', 'Reflective roof', 'Bare soil']
FEAT_NAMES = ['NDVI', 'NDBI', 'MNDWI', 'BUI', 'CIre', 'NMI']

# An RBF SVM is O(n^2), so fitting on every pixel of a scene would take hours.
MAX_TRAIN_SAMPLES = 12000
MAX_CV_SAMPLES = 4000
MIN_CLASS_SAMPLES = 10   # stratified split and 5-fold CV need a few examples per class
PREDICT_CHUNK = 200_000


def seed_labels(indices: dict) -> np.ndarray:
    NDVI, NDBI, MNDWI = indices['NDVI'], indices['NDBI'], indices['MNDWI']
    BUI, CIre, NMI = indices['BUI'], indices['CIre'], indices['NMI']
    labels = np.full(NDVI.shape, -1, dtype=np.int8)
    labels[MNDWI > 0.12] = 0
    labels[(NDVI > 0.30) & (CIre > 1.2)] = 1
    labels[(NDVI > 0.10) & (NDVI <= 0.30) & (CIre <= 1.2) & (labels < 0)] = 2
    labels[(NDBI > 0.10) & (NMI < -0.05) & (BUI > 0.15) & (labels < 0)] = 3
    labels[(NDBI > 0.03) & (NMI >= -0.05) & (NMI < 0.08)
           & (BUI > 0.0) & (labels < 0)] = 4
    labels[(NDBI > 0.03) & (NMI >= 0.08) & (labels < 0)] = 5
    labels[(NDVI <= 0.10) & (NDBI <= 0.03) & (MNDWI <= 0.12)
           & (labels < 0)] = 6
    return labels


def _subsample(X: np.ndarray, y: np.ndarray, n: int):
    """Stratified subsample of at most n rows."""
    if len(y) <= n:
        return X, y
    X_s, _, y_s, _ = train_test_split(X, y, train_size=n, random_state=42, stratify=y)
    return X_s, y_s


def train_ensemble(feats_T2: np.ndarray, seed_T2: np.ndarray,
                   valid_mask: np.ndarray) -> tuple:
    H, W, F = feats_T2.shape
    feats_flat = feats_T2.reshape(-1, F)
    labels_flat = seed_T2.flatten()
    valid_flat = valid_mask.flatten()
    labelled = (labels_flat >= 0) & valid_flat & np.all(np.isfinite(feats_flat), axis=1)

    X_all = feats_flat[labelled]
    y_all = labels_flat[labelled].astype(int)

    # drop classes that are too rare to train and cross-validate on
    counts = np.bincount(y_all, minlength=len(CLASS_NAMES))
    keep = counts >= MIN_CLASS_SAMPLES
    if keep.sum() < 2:
        raise RuntimeError('Not enough labelled pixels to train the classifier '
                           '(scene may be mostly cloud or no-data).')
    row_ok = keep[y_all]
    X_all, y_all = X_all[row_ok], y_all[row_ok]

    le = LabelEncoder()
    y_enc = le.fit_transform(y_all)
    classes_present = [CLASS_NAMES[c] for c in le.classes_]

    scaler = StandardScaler()
    X_sc = scaler.fit_transform(X_all)

    X_fit, y_fit = _subsample(X_sc, y_enc, MAX_TRAIN_SAMPLES)
    X_tr, X_te, y_tr, y_te = train_test_split(
        X_fit, y_fit, test_size=0.20, random_state=42, stratify=y_fit)

    xgb_clf = xgb.XGBClassifier(n_estimators=300, max_depth=6, learning_rate=0.05,
                                subsample=0.8, colsample_bytree=0.8,
                                eval_metric='mlogloss', random_state=42,
                                n_jobs=-1, verbosity=0)
    xgb_clf.fit(X_tr, y_tr)

    svm_clf = SVC(kernel='rbf', C=10.0, gamma='scale', probability=True,
                  class_weight='balanced', random_state=42)
    svm_clf.fit(X_tr, y_tr)

    rf_clf = RandomForestClassifier(n_estimators=200, max_depth=14,
                                    class_weight='balanced', random_state=42, n_jobs=-1)
    rf_clf.fit(X_tr, y_tr)

    ensemble = VotingClassifier(
        estimators=[('xgb', xgb_clf), ('svm', svm_clf), ('rf', rf_clf)],
        voting='soft', n_jobs=-1)
    ensemble.fit(X_tr, y_tr)

    y_pred = ensemble.predict(X_te)
    kappa = cohen_kappa_score(y_te, y_pred)

    # cross-validation on a smaller stratified sample to keep run time sane
    X_cv, y_cv = _subsample(X_sc, y_enc, MAX_CV_SAMPLES)
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_xgb = cross_val_score(xgb_clf, X_cv, y_cv, cv=skf, scoring='f1_macro')
    cv_svm = cross_val_score(svm_clf, X_cv, y_cv, cv=skf, scoring='f1_macro')
    cv_ens = cross_val_score(ensemble, X_cv, y_cv, cv=skf, scoring='f1_macro')

    # predict the full raster in chunks
    finite_ok = np.all(np.isfinite(feats_flat), axis=1) & valid_flat
    material_map_enc = np.full(H * W, -1, dtype=np.int16)
    idx = np.flatnonzero(finite_ok)
    for start in range(0, len(idx), PREDICT_CHUNK):
        sel = idx[start:start + PREDICT_CHUNK]
        material_map_enc[sel] = ensemble.predict(scaler.transform(feats_flat[sel]))

    material_map = np.full(H * W, -1, dtype=np.int8)
    for enc_label, orig_label in enumerate(le.classes_):
        material_map[material_map_enc == enc_label] = orig_label
    material_map = material_map.reshape(H, W)

    metrics = {
        'classes_present': classes_present,
        'cohen_kappa_ensemble': float(kappa),
        'cv_macro_f1_xgb': float(cv_xgb.mean()),
        'cv_macro_f1_svm': float(cv_svm.mean()),
        'cv_macro_f1_ensemble': float(cv_ens.mean()),
        # Be explicit about what these scores measure
        'label_source': 'rule-based seed labels (pseudo-labels), not field-verified ground truth',
    }

    return material_map, metrics, scaler, le, ensemble
