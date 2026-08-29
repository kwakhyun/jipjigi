import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "렌트플로우", short_name: "렌트플로우", description: "놓치기 전에 움직이는 임대 관리", start_url: "/app", display: "standalone", background_color: "#fbfafd", theme_color: "#100b2c", lang: "ko" };
}
