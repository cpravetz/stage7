FROM node:18-alpine
WORKDIR /app
COPY . .
# Create a non-root user for execution
RUN addgroup -S coder && adduser -S coder -G coder
USER coder
CMD ["node", "-e", "const fs = require('fs'); const code = fs.readFileSync(0, 'utf-8'); eval(code);"]