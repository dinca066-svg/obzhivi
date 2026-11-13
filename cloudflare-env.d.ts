declare namespace Cloudflare {
  interface Env {
    KIE_API_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
