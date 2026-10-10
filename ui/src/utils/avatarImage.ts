/**
 * 头像图片处理。
 *
 * <p>头像以 data URL 形式保存在 {@code admin_user.avatar_url}，该列是 {@code TEXT}，
 * 上限 65535 字节。原图直接转 base64 会轻易超过这个上限，后端表现为
 * {@code MysqlDataTruncation: Data too long for column 'avatar_url'}。</p>
 *
 * <p>因此这里统一在浏览器端把图片裁成正方形并压缩成 JPEG：头像在侧栏只显示 28px、
 * 账号页显示 80px，256px 已远超实际需要，没必要把原始大图塞进数据库行里。</p>
 */

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
/** 列上限 65535 字节；base64 是 ASCII，字符数即字节数，这里留出安全余量。 */
const MAX_DATA_URL_CHARS = 60000;

/** 依次降级，直到编码结果能放进列里。 */
const ENCODE_ATTEMPTS = [
  {
    edge: 256,
    quality: 0.82
  },
  {
    edge: 192,
    quality: 0.75
  },
  {
    edge: 128,
    quality: 0.7
  },
] as const;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法解析这张图片，请换一张试试"));
    };
    image.src = objectUrl;
  });
}

/** 居中裁剪成正方形后等比缩放到 edge，避免头像被拉伸变形。 */
function encodeSquareJpeg(
  image: HTMLImageElement,
  edge: number,
  quality: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器不支持图片处理");
  }
  // JPEG 没有透明通道，先铺白底，避免 PNG 透明区域变成黑块
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, edge, edge);

  const side = Math.min(image.naturalWidth, image.naturalHeight);
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    edge,
    edge,
  );
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * 读取并压缩头像，返回可直接入库的 data URL。
 *
 * @throws Error 文件不是图片、体积过大、无法解码，或压缩后仍超出列上限
 */
export async function readAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("图片不能超过 8MB");
  }

  const image = await loadImage(file);
  let encoded = "";
  for (const attempt of ENCODE_ATTEMPTS) {
    encoded = encodeSquareJpeg(image, attempt.edge, attempt.quality);
    if (encoded.length <= MAX_DATA_URL_CHARS) {
      return encoded;
    }
  }
  throw new Error("图片压缩后仍然过大，请换一张内容更简单的图片");
}
