import { BunactConfig } from "bunact";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

export default {
  port: 11111,
  plugins: [
    {
      name: "tailwind",

      bundlePlugin: {
        name: "tailwind-postcss",
        setup(build) {
          build.onLoad({ filter: /\.css$/ }, async (args) => {
            console.log('Loading CSS file:', args.path);
            const css = await Bun.file(args.path).text();
            const result = await postcss([tailwindcss]).process(css, {
              from: args.path,
            });

            return {
              contents: result.css,
              loader: "css",
            };
          });
        },
      },
    },
  ],
} satisfies BunactConfig;
