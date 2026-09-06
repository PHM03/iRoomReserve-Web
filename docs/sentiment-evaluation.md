# Sentiment Evaluation

This evaluates the current production `analyzeSentiment()` implementation against a human-labeled room-feedback dataset. It does not change the sentiment algorithm, lexicon, thresholds, or production five-class classifier.

## Dataset

No human-labeled feedback dataset is currently committed in this repository. Use `data/sentiment-evaluation-template.csv` as the starting point and save a real labeled dataset as `data/sentiment-evaluation.csv`.

## Export Real Feedback Text

Real capstone feedback is user-written data and must be treated as sensitive. Do not commit exported feedback text or generated evaluation reports to Git without explicit approval.

Use the local/admin-only exporter from an authorized development environment with the existing Firebase Admin environment variables configured. The exporter reads Firestore collection `feedback`, extracts only the feedback text, and writes only `text,humanLabel`. It does not export document IDs, user IDs, names, reservation IDs, room/building metadata, timestamps, ratings, system sentiment labels, VADER scores, admin responses, or any other metadata.

```bash
npm run export:sentiment-feedback -- --out data/sentiment-evaluation.csv --pii-report reports/sentiment-evaluation-pii-review.json
```

The exporter leaves `humanLabel` blank. It does not use VADER output, existing system labels, star ratings, or compound scores. It also writes a separate PII review report with row numbers and flag types only. Review flagged rows locally before labeling; redact obvious names, email addresses, phone numbers, student numbers, or class/section identifiers from the CSV only when necessary, without rewriting sentiment-bearing text.

Required columns:

```csv
text,humanLabel
```

Allowed `humanLabel` values:

- `positive`
- `neutral`
- `negative`
- `insufficient_context`

Use `insufficient_context` for a bare Yes/No response whose meaning cannot be
determined without the question or additional feedback context.

Label each row manually from the user's intended meaning, not from the system prediction. Do not delete difficult or ambiguous examples after seeing predictions. If a label is corrected later, record why it was a human-labeling correction.

## Production Label Mapping

The production system keeps its five overall labels. The capstone evaluation maps them deterministically:

| Production label | Evaluation label |
| --- | --- |
| `very_positive` | `positive` |
| `positive` | `positive` |
| `neutral` | `neutral` |
| `negative` | `negative` |
| `very_negative` | `negative` |
| `insufficient_context` | `insufficient_context` |

## Run

```bash
npm run evaluate:sentiment -- data/sentiment-evaluation.csv --out reports/sentiment-evaluation-report.json
```

The report includes every evaluated row with the original text, human label, raw VADER scores and label, final contextual label, contextual override reason, mapped prediction, and correctness. Aspect results are reserved for callers that already have aspect analysis available; the standalone evaluator records that field as unavailable. It also prints total samples, correct/incorrect counts, accuracy, a confusion matrix, per-class precision/recall/F1, and misclassified examples.

Do not claim the approximately 85% capstone target is achieved unless this script reports a measured accuracy at or above 85% on a human-labeled dataset.
