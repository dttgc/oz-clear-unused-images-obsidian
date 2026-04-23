```bash
docker pull node:24-alpine
```

```bash
docker run -it --rm --entrypoint sh node:24-alpine
```

```bash
docker run -it --rm \
  -v $(pwd):/app \
  -w /app \
  -p 3000:3000 \
  node:24-alpine \
  sh
```

```bash
npm install
```

```bash
npm run build
```