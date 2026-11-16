import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryCandidates, agreedCjkText, recognizeWithCjkRecovery } from '../ocr/cjk-recovery.js';

const word = (text = 'FRE:', confidence = 62) => ({ text, confidence, bbox: { x0: 8, y0: 40, x1: 135, y1: 78 } });
const dataFor = words => ({ text: words.map(item => item.text).join(' '), blocks: [{ paragraphs: [{ lines: [{ words }] }] }] });

test('只挑低可信度且形狀符合的字框，排除已辨識中文、高可信度英文與無效座標', () => {
  const words = [word(), word('devenzi', 95), word('開發者', 30), { ...word('BAD'), bbox: { x0: -1, y0: 1, x1: 50, y1: 30 } }];
  const candidates = recoveryCandidates(dataFor(words), 600, 400);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].text, 'FRE:');
});

test('兩次校正必須同字且可信度改善；不因另一個候選分數較高就改字', () => {
  assert.equal(agreedCjkText([{ text: '開 發 者 :', confidence: 89 }, { text: '開 發 者', confidence: 79 }], word()), '開發者:');
  assert.equal(agreedCjkText([{ text: '開發者', confidence: 89 }, { text: '開發老', confidence: 92 }], word()), null);
  assert.equal(agreedCjkText([{ text: '開發者', confidence: 89 }, { text: '開發者', confidence: 60 }], word()), null);
  assert.equal(agreedCjkText([{ text: 'OPEN', confidence: 99 }, { text: 'OPEN', confidence: 99 }], word()), null);
});

function canvas() {
  return { width: 600, height: 400, ownerDocument: { createElement: () => ({ getContext: () => ({ fillRect() {}, setTransform() {}, drawImage() {} }) }) } };
}

test('只替換對應字框的文字位置，保留英文、換行與相同的高可信度字串', async () => {
  const data = dataFor([word('FRE:', 96), word(), word('devenzi', 95)]);
  data.text = 'FRE:\nFRE: devenzi';
  const events = [];
  let calls = 0;
  const worker = {
    recognize: async () => ++calls === 1 ? { data } : { data: { text: '開 發 者 :', confidence: 90 } },
    reinitialize: async language => events.push(language),
    setParameters: async value => events.push(value.tessedit_pageseg_mode)
  };
  const result = await recognizeWithCjkRecovery(worker, canvas(), null, { language: 'chi_tra+eng', mode: '3', budget: { remaining: 4 } });
  assert.equal(result.data.text, 'FRE:\n開發者: devenzi');
  assert.equal(data.text, 'FRE:\nFRE: devenzi');
  assert.deepEqual(events, ['chi_tra', '7', 'chi_tra+eng', '3']);
  assert.equal(calls, 3);
});

test('英文模式、使用者關閉校正或工作額度耗盡，均不改寫原始結果', async () => {
  for (const options of [{ language: 'eng' }, { language: 'chi_tra+eng', recoverCjk: false }, { language: 'chi_tra+eng', budget: { remaining: 0 } }]) {
    const data = dataFor([word()]);
    const worker = { recognize: async () => ({ data }), reinitialize: async () => { throw Error('不應切換模型'); } };
    const result = await recognizeWithCjkRecovery(worker, canvas(), null, { mode: '3', budget: { remaining: 4 }, ...options });
    assert.equal(result.data.text, data.text);
  }
});

test('每張圖共用校正額度，處理失敗仍還原原語言與版面', async () => {
  let calls = 0;
  const events = [];
  const worker = {
    recognize: async () => { if (++calls === 1) return { data: dataFor([word()]) }; throw Error('辨識失敗'); },
    reinitialize: async language => events.push(language),
    setParameters: async parameters => events.push(parameters.tessedit_pageseg_mode)
  };
  const budget = { remaining: 1 };
  await assert.rejects(recognizeWithCjkRecovery(worker, canvas(), null, { language: 'chi_tra+eng', mode: '6', budget }), /辨識失敗/);
  assert.equal(budget.remaining, 0);
  assert.deepEqual(events, ['chi_tra', '7', 'chi_tra+eng', '6']);
});
