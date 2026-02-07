# Deployment Guide

## Quick Start with Docker

The easiest way to deploy ApplyPilot is using Docker Compose:

```bash
# Clone the repository
git clone https://github.com/yourusername/applypilot.git
cd applypilot

# Set environment variables
cp .env.example .env
# Edit .env with your configuration

# Start services
docker-compose up -d

# Access the application
# Web UI: http://localhost
# API: http://localhost:8080
```

## Environment Variables

Create a `.env` file with the following:

```env
# Required
JWT_SECRET=your-super-secret-jwt-key-change-this

# Optional: External LLM APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
AZURE_OPENAI_API_KEY=...

# Optional: Configuration
NODE_ENV=production
PORT=8080
FRONTEND_URL=http://localhost
```

## Deployment Options

### Option 1: VPS (DigitalOcean, Linode, AWS EC2)

1. **Provision server** (Ubuntu 22.04 recommended)
2. **Install Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```
3. **Clone and deploy**:
   ```bash
   git clone https://github.com/yourusername/applypilot.git
   cd applypilot
   docker-compose up -d
   ```
4. **Setup reverse proxy** (nginx):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:80;
       }
       
       location /api {
           proxy_pass http://localhost:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
       }
   }
   ```

### Option 2: Railway (Easiest)

1. Fork this repository
2. Create new project on [Railway](https://railway.app)
3. Connect your GitHub repo
4. Add environment variables in Railway dashboard
5. Deploy!

### Option 3: Vercel (Frontend Only)

For deploying just the web UI:

```bash
cd apps/web
vercel --prod
```

### Option 4: Render

1. Create a Web Service for the API
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: Node

2. Create a Static Site for the web UI
   - Build Command: `cd apps/web && npm install && npm run build`
   - Publish Directory: `apps/web/dist`

## Production Checklist

- [ ] Change default JWT_SECRET
- [ ] Set up SSL/TLS (Let's Encrypt)
- [ ] Configure firewall (allow 80, 443, 8080)
- [ ] Set up automated backups for data directory
- [ ] Configure log rotation
- [ ] Set up monitoring (optional)
- [ ] Review and set appropriate API rate limits

## SSL/TLS with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

## Backup Strategy

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf "backups/applypilot_$DATE.tar.gz" data/ resumes/

# Add to crontab for daily backups
0 2 * * * /path/to/backup.sh
```

## Troubleshooting

### API won't start
- Check logs: `docker-compose logs api`
- Verify environment variables
- Ensure port 8080 is not in use

### Web UI can't connect to API
- Check CORS settings
- Verify FRONTEND_URL environment variable
- Check browser console for errors

### Database issues
- Ensure data directory has correct permissions
- Check disk space
- Verify SQLite is not corrupted

## Updating

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

## Support

For deployment issues:
1. Check logs: `docker-compose logs -f`
2. Review [GitHub Issues](https://github.com/yourusername/applypilot/issues)
3. Join our [Discord community](https://discord.gg/applypilot)
