import type { ReactNode } from "react";
import type { Metadata } from "bunact/types";
import { generateMetatag } from "bunact/metadata";
import "@shared/globals.css";

interface LayoutProps {
  children: ReactNode;
  metadata?: Metadata[];
}

const Layout = async ({ children, metadata = [] }: LayoutProps) => {
  return {
    default: () => {
      const metaTags = generateMetatag(metadata);

      return (
        <html lang="en">
          <head>
            <meta charSet="UTF-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0"
            />
            {metaTags}
          </head>
          <body>{children}</body>
        </html>
      );
    },
  };
};

export default Layout;
