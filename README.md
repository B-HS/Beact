<div style="display:flex; flex-direction:column; justifyContent: center; width:100%">
<img src="./meact.png" width="200px" alt="meact logo" />
<sub>(mehhh)</sub>
</div>
<br/>

# Meact

> A lightweight React framework built with Bun, featuring file-based routing, SSR streaming, and ISR.

**This framework is written in Bun and requires Bun to run.**

## Features

- **File-based Routing** - Automatic routing based on `pages/` directory structure
- **SSR & Streaming** - React streaming server-side rendering with hydration
- **ISR** - Incremental Static Regeneration with background revalidation
- **Image Optimization** - Automatic image optimization and caching using Sharp
- **API Routes** - Built-in API endpoints support in `pages/api/`
- **Type Safety** - Full TypeScript support

## Quick Start

### Create a New Project

```bash
bunx meact create my-app
cd my-app
```

### Start Development Server

```bash
bun dev
```

### Build for Production

```bash
bun run build
```

## Project Structure

```
my-app/
├── pages/
│   ├── page.tsx              # Main page
│   ├── layout.tsx            # Layout component
│   ├── not-found.tsx         # 404 page
│   ├── loading.tsx           # Loading UI
│   ├── error.tsx             # Error boundary
│   └── api/
│       └── hello.ts          # API endpoint
├── public/                   # Static files
└── proxy.ts                  # Global middleware (optional)
```

## Core Features

### Page Component

```tsx
// pages/page.tsx
export const Page = async ({ params, searchParams, cookies, headers }) => {
  const data = await fetch('...')

  return {
    metadata: {
      title: 'My Page',
      description: '...'
    },
    default: () => <div>{/* ... */}</div>
  }
}
```

### Dynamic Routing

```
pages/
├── [id]/page.tsx           # Matches /123
├── [...slug]/page.tsx      # Matches /a/b/c
└── [[...slug]]/page.tsx    # Matches / or /a/b/c
```

### Image Optimization

```tsx
import { Image } from 'meact/ui/Image'

<Image
  src="/photo.jpg"
  width={800}
  height={600}
  alt="Photo"
  quality={80}
/>

// Fill mode
<div style={{ position: 'relative', width: '100%', height: '400px' }}>
  <Image
    src="/banner.jpg"
    fill
    objectFit="cover"
    alt="Banner"
  />
</div>
```

### ISR (Incremental Static Regeneration)

```tsx
// pages/blog/[id]/page.tsx
export const revalidate = 60 // Revalidate every 60 seconds

export const BlogPost = async ({ params }) => {
  const post = await fetchPost(params.id)

  return {
    default: () => <article>{/* ... */}</article>
  }
}
```

### API Routes

```tsx
// pages/api/users/[id].ts
export const GET = async (request: Request, { params }) => {
  const user = await db.user.findById(params.id)
  return Response.json(user)
}

export const POST = async (request: Request) => {
  const body = await request.json()
  const user = await db.user.create(body)
  return Response.json(user, { status: 201 })
}
```

### Environment Variables

```bash
# .env
SECRET_KEY=server-only-value              # Server-only
MEACT_PUBLIC_API_URL=https://api.com     # Available on client
```

```tsx
// Server component
const secret = process.env.SECRET_KEY              // Server-only
const apiUrl = process.env.MEACT_PUBLIC_API_URL   // Server + Client
```

## Requirements

- **Bun** ≥ 1.3.0
- **React** 19
- **TypeScript** 5

## License

MIT

## Links

- [GitHub](https://github.com/B-HS/Meact)
