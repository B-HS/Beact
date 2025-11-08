<div style="display:flex; flex-direction:column; justifyContent: center; width:100%">
<img src="./meact.png" width="200px" alt="meact logo" />
<sub>(mehhh)</sub>
</div>
<br/>

# Meact

## 특징

- **파일 기반 라우팅** - `pages/` 디렉토리 기반 자동 라우팅
- **SSR & Streaming** - React Streaming SSR 지원
- **ISR** - Incremental Static Regeneration
- **이미지 최적화** - Sharp 기반 자동 최적화 및 캐싱
- **API Routes** - `pages/api/` 디렉토리 기반 API 엔드포인트
- **타입 안전** - TypeScript 완벽 지원

## 빠른 시작

### 새 프로젝트 생성

```bash
bunx meact create my-app
cd my-app
```

### 개발 서버 실행

```bash
bun dev
```

### 프로덕션 빌드

```bash
bun run build
```

## 프로젝트 구조

```
my-app/
├── pages/
│   ├── page.tsx              # 메인 페이지
│   ├── layout.tsx            # 공통 레이아웃
│   ├── not-found.tsx         # 404 페이지
│   ├── loading.tsx           # 로딩 UI
│   ├── error.tsx             # 에러 바운더리
│   └── api/
│       └── hello.ts          # API 엔드포인트
├── public/                   # 정적 파일
└── proxy.ts                  # 글로벌 미들웨어 (옵션)
```

## 핵심 기능

### 페이지 컴포넌트

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

### 동적 라우팅

```
pages/
├── [id]/page.tsx           # /123
├── [...slug]/page.tsx      # /a/b/c
└── [[...slug]]/page.tsx    # / 또는 /a/b/c
```

### 이미지 최적화

```tsx
import { Image } from 'meact/ui/Image'

<Image
  src="/photo.jpg"
  width={800}
  height={600}
  alt="Photo"
  quality={80}
/>

// Fill 모드
<div style={{ position: 'relative', width: '100%', height: '400px' }}>
  <Image
    src="/banner.jpg"
    fill
    objectFit="cover"
    alt="Banner"
  />
</div>
```

### ISR

```tsx
// pages/blog/[id]/page.tsx
export const revalidate = 60 // 60초마다 재검증

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

### 환경 변수

```bash
# .env
SECRET_KEY=server-only-value              # 서버 전용
MEACT_PUBLIC_API_URL=https://api.com     # 클라이언트 포함
```

```tsx
// 서버 컴포넌트
const secret = process.env.SECRET_KEY              // 서버만
const apiUrl = process.env.MEACT_PUBLIC_API_URL   // 서버 + 클라이언트
```

## 요구사항

- **Bun** ≥ 1.0.0
- **React** 19
- **TypeScript** 5

## 라이선스

MIT

## 링크

- [GitHub](https://github.com/B-HS/Meact)
