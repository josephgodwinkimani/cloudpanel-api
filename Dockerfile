FROM node:18-alpine

# Install CloudPanel CLI (this would need to be adapted based on actual installation method)
# RUN wget https://installer.cloudpanel.io/ce/v2/install.sh && bash install.sh

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Create logs directory
RUN mkdir -p logs

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

CMD ["node", "src/index.js"]
