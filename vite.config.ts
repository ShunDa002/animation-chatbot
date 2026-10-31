import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => {
  const isBuild = command === "build";

  return {
    cacheDir: isBuild
      ? "/tmp/animation-chatbot-vite-cache-cloudflare"
      : "/tmp/animation-chatbot-vite-cache",

    plugins: [
      tailwindcss(),
      vinext(
        isBuild
          ? {
              images: {
                optimizer: imagesOptimizer(),
              },
            }
          : undefined,
      ),

      ...(isBuild
        ? [
            cloudflare({
              viteEnvironment: {
                name: "rsc",
                childEnvironments: ["ssr"],
              },
            }),
          ]
        : []),
    ],
  };
});
