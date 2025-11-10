import type { Metadata, PageProps } from "bunact/types";

const Home = async ({ params, searchParams }: PageProps) => {
  const metadata: Metadata[] = [
    { title: "Welcome to Bunact" },
    { name: "description", content: "A modern React framework built with Bun" },
  ];

  return {
    metadata,
    default: () => (
      <div>
        <h1>Welcome to Bunact</h1>
        <p>Edit pages/page.tsx to get started!</p>
      </div>
    ),
  };
};

export default Home;
