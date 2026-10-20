import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";

export default defineConfig({
    cacheDir: "/tmp/animation-chatbot-vite-cache-cloudflare",

    plugins: [
        vinext({
            images: {
                optimizer: imagesOptimizer(),
            },
        }),

        cloudflare({
            viteEnvironment: {
                name: "rsc",
                childEnvironments: ["ssr"],
            },
        }),
    ],
});