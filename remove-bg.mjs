import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, 'public');

// professor.png는 실제 사진이라 제외
const EXCLUDE = new Set(['professor.png']);

// 흰색 판단 임계값 (0~255, 높을수록 순백색만 제거)
const THRESHOLD = 240;

async function removeWhiteBackground(filepath, filename) {
  const { data, info } = await sharp(filepath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r >= THRESHOLD && g >= THRESHOLD && b >= THRESHOLD) {
      data[i + 3] = 0;
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(filepath);

  console.log(`✓ ${filename}`);
}

const files = await readdir(publicDir);
const pngs = files.filter(f => extname(f) === '.png' && !EXCLUDE.has(basename(f)));

console.log(`흰 배경 제거: ${pngs.length}개 파일 처리 중...\n`);
for (const file of pngs) {
  await removeWhiteBackground(join(publicDir, file), file);
}
console.log('\n완료! 이제 이미지가 투명 배경으로 저장됐습니다.');
