declare module 'heic-convert' {
  const convert: (options: {
    buffer: Uint8Array;
    format: 'JPEG';
    quality: number;
  }) => Promise<ArrayBuffer>;
  export default convert;
}
