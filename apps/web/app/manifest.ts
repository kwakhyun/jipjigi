import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "집지기", short_name: "집지기", description: "월세부터 민원까지 먼저 챙기는 임대 관리", start_url: "/app", display: "standalone", background_color: "#fbfafd", theme_color: "#100b2c", lang: "ko" };
}
