import { database } from '../server/http.js';
import { fit, holdout, evaluate } from '../shared/model.js';
const db = database(null, true);
const [{
  consent_epoch
}] = await db('learning_state?id=eq.1&select=consent_epoch');
const rows = [];
const max = 100000;
for (let offset = 0; offset <= max; offset += 1000) {
  const page = await db('rpc/training_ratings', {
    method: 'POST',
    body: {
      page_offset: offset
    }
  });
  rows.push(...page);
  if (rows.length > max) throw new Error('Dataset exceeds the in-memory trainer limit; use a batch training worker.');
  if (page.length < 1000) break;
}
if (new Set(rows.map(r => r.user_id)).size < 10 || rows.length < 100) throw new Error('Training needs at least 10 consenting users and 100 ratings. No model published.');
const {
  train,
  test,
  unsupported
} = holdout(rows);
const trial = fit(train);
const metrics = {
  ...evaluate(trial, train, test),
  unsupported_holdout: unsupported,
  ratings: rows.length,
  users: new Set(rows.map(r => r.user_id)).size,
  trained_at: new Date().toISOString()
};
console.log(JSON.stringify(metrics, null, 2));
if (metrics.validation_count < 20 || metrics.rmse >= metrics.baseline_rmse) throw new Error('The model did not beat the per-user mean baseline on held-out ratings. No model published.');
const artifact = fit(rows);
if (JSON.stringify(artifact).length > 10000000) throw new Error('Model exceeds 10 MB; switch to a vector store before publishing.');
const id = await db('rpc/publish_model', {
  method: 'POST',
  body: {
    expected_epoch: consent_epoch,
    model: artifact,
    report: metrics
  }
});
console.log(`Published model ${id}.`);
