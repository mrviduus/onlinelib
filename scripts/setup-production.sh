#!/bin/bash
# Textstack Production Setup Script
# Run with: sudo ./scripts/setup-production.sh

set -e

echo "=== Textstack Production Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root (sudo)"
    exit 1
fi

PROJECT_DIR="/home/vasyl/projects/onlinelib/onlinelib"
NGINX_CONF="$PROJECT_DIR/infra/nginx-prod/textstack.conf"

echo "Step 1: Updating system packages..."
apt-get update

echo ""
echo "Step 2: Installing nginx, certbot, ufw..."
apt-get install -y nginx certbot python3-certbot-nginx ufw

echo ""
echo "Step 3: Configuring UFW firewall..."
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status

echo ""
echo "Step 4: Creating certbot webroot directory..."
mkdir -p /var/www/certbot

echo ""
echo "Step 5: Installing nginx configuration..."
# Remove default site if exists
rm -f /etc/nginx/sites-enabled/default

# Copy our configuration
cp "$NGINX_CONF" /etc/nginx/sites-available/textstack
ln -sf /etc/nginx/sites-available/textstack /etc/nginx/sites-enabled/textstack

echo ""
echo "Step 6: Testing nginx configuration..."
nginx -t

echo ""
echo "Step 7: Starting nginx..."
systemctl enable nginx
systemctl restart nginx
systemctl status nginx --no-pager

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Configure DNS: Point textstack.app and textstack.dev to your public IP"
echo "2. Configure router: Port forward 80 and 443 to this machine"
echo "3. Start Docker services:"
echo "   cd $PROJECT_DIR"
echo "   docker compose -f docker-compose.prod.yml --env-file .env.production up -d"
echo ""
echo "4. Once DNS propagates, run certbot for SSL:"
echo "   sudo certbot --nginx -d textstack.app -d textstack.dev"
echo ""
