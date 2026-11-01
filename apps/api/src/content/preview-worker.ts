import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import convert from 'heic-convert';
const [source, destination, kind] = process.argv.slice(2);
if (!source || !destination) throw new Error('Missing preview paths');
const input =
  kind === 'heic'
    ? Buffer.from(
        await convert({
          buffer: await readFile(source),
          format: 'JPEG',
          quality: 0.9,
        }),
      )
    : source;
const preview = await sharp(input, { limitInputPixels: 60_000_000 })
  .rotate()
  .jpeg({ quality: 90 })
  .toBuffer();
await writeFile(destination, preview, { flag: 'wx' });
await writeFile(
  destination.replace(/\.jpg$/, '.thumb.jpg'),
  await sharp(preview)
    .resize({
      width: 400,
      height: 400,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer(),
  { flag: 'wx' },
);
