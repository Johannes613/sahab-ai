// Cross-validated results for the three material classifiers.
// Source: sahab-api/model_metrics.json (5-fold stratified CV, 77,105 labelled pixels from scene
// 20250515_080954_16_4001). Macro F1 is the CV score; Cohen's Kappa is on a 20% held-out split.
// The labels are rule-based seed labels, not field-verified ground truth.
export const MODEL_METRICS = [
  { name: 'XGBoost', f1: 0.9300, kappa: 0.9976 },
  { name: 'SVM', f1: 0.9767, kappa: 0.9889 },
  { name: 'Voting Ensemble', f1: 0.9842, kappa: 0.9993 },
];

export const MODEL_METRICS_NOTE =
  'Scores measure agreement with rule-based seed labels (spectral-index thresholds), not ' +
  'field-verified ground truth, so they overstate real-world accuracy. Field sampling would ' +
  'give an independent estimate.';
