import * as ort from '../vendor/background-removal/ort.wasm.min.mjs';
import { readCutout, verifyCutout } from './cutout-model-store.js';
import { cutoutInput, cutoutMask, validateImageSize } from './cutout-pixels.js';
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL('../vendor/paddle/ort/', import.meta.url).href;
self.onmessage = async ({ data }) => {
  let session;
  try {
    validateImageSize(data.bitmap.width, data.bitmap.height);
    const model = await readCutout();
    if (!model) throw Error('尚未安裝去背模型，請先下載');
    await verifyCutout(model);
    self.postMessage({ type: 'PROGRESS', value: 0.12, text: '正在載入本機去背模型…' });
    session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const size = 512, work = new OffscreenCanvas(size, size), g = work.getContext('2d', { willReadFrequently: true });
    g.drawImage(data.bitmap, 0, 0, size, size);
    const tensor = new ort.Tensor('float32', cutoutInput(g.getImageData(0, 0, size, size).data), [1, 3, size, size]);
    self.postMessage({ type: 'PROGRESS', value: 0.35, text: '正在本機分離主體與背景…' });
    const outputs = await session.run({ input_image: tensor });
    const output = outputs.output_image;
    if (!output) throw Error('去背模型缺少遮罩輸出');
    g.putImageData(new ImageData(cutoutMask(output.data), size, size), 0, 0);
    tensor.dispose(); for (const value of Object.values(outputs)) value.dispose();
    self.postMessage({ type: 'PROGRESS', value: 0.9, text: '正在產生透明圖片…' });
    const result = new OffscreenCanvas(data.bitmap.width, data.bitmap.height), ctx = result.getContext('2d');
    ctx.drawImage(data.bitmap, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(work, 0, 0, result.width, result.height);
    const bitmap = result.transferToImageBitmap();
    self.postMessage({ type: 'RESULT', bitmap }, [bitmap]);
  } catch (error) { self.postMessage({ type: 'ERROR', error: error.message || String(error) }); }
  finally { data.bitmap?.close(); await session?.release(); }
};
