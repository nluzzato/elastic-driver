# AI Alert Context Agent

An intelligent agent that provides rich context for Prometheus alerts by automatically looking up alert definitions from GitHub repositories and enriching them with helpful information.

## 🎯 Problem Solved

**Before**: Cryptic alert messages like `[FIRING:1] ContainerCPUThrotellingIsHigh for`  
**After**: Rich context showing PromQL queries, durations, GitHub links, and explanations

## ✨ Features

- 🔍 **Automatic Alert Lookup**: Searches GitHub repositories for alert rule definitions
- 📊 **Rich Context**: Shows PromQL queries, durations, severity levels, and descriptions  
- 🔗 **GitHub Integration**: Direct links to alert definitions in your repository
- 💾 **Fallback Support**: Uses mock data when GitHub access fails
- 🏷️ **Instance Details**: Preserves all pod, container, and cluster information
- 🎯 **Slack Ready**: Formatted output perfect for Slack bot replies

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (for native fetch support)
- TypeScript
- GitHub Personal Access Token (optional but recommended)

### Installation

```bash
# Clone or create the project
cd alert-context-agent

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your GitHub token to .env
echo "GITHUB_TOKEN=your_github_token_here" >> .env
```

### Basic Usage

```bash
# Run in development mode
npm run dev

# Build and run
npm run build
npm start
```

### Example Output

```
🔥 Alert Context for ContainerCPUThrotellingIsHigh
--------------------------------------------------
📊 Status: FIRING
📝 Description: The process in the container api-server has 18.3% CPU throttling

⚠️ Rule Definition (🔗 GitHub):
📁 File: default_alerts/k8s_alerts.yaml
• Query: sum(increase(owner:container_cpu_cfs_throttled_periods_total{container!~"mysqld.*|filebeat"}[1m]))...
• Duration: 10m
• Severity: warning
• Target: slack

📚 Rule Details:
• Summary: A process has been experienced elevated CPU throttling.
• Description: Container has high CPU throttling indicating resource constraints

🔗 GitHub: https://github.com/Connecteam/alerts/blob/main/default_alerts/k8s_alerts.yaml

🏷️ Instance Details:
• container: api-server
• namespace: production
• pod: api-server-xyz789
• team: backend
```

## 📁 Project Structure

```
src/
├── config/           # Configuration management
├── services/         # Core business logic
│   ├── AlertService.ts      # Main alert processing
│   └── GitHubService.ts     # GitHub API integration
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── index.ts          # Main entry point

examples/             # Usage examples
├── basic-usage.ts    # Simple example
└── slack-integration.ts  # Slack bot example

docs/                 # Documentation
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with:

```bash
# GitHub repository configuration
GITHUB_OWNER=Connecteam
GITHUB_REPO=alerts
GITHUB_TOKEN=your_github_personal_access_token

# Optional: API rate limiting
GITHUB_API_RATE_LIMIT=5000
```

### GitHub Token Setup

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Create a new token with `repo` scope (for private repos) or `public_repo` (for public repos)
3. Add the token to your `.env` file

## 🎭 Integration Examples

### Slack Bot Integration

```typescript
import { AlertService } from './src/services/AlertService';
import { config } from './src/config';

const alertService = new AlertService(config);

// In your Slack event handler
app.message(/\[(?:FIRING|RESOLVED)/, async ({ message, say }) => {
  const alert = parseSlackAlert(message.text);
  const result = await alertService.processAlert(alert);
  
  await say({
    text: result.formattedContext,
    thread_ts: message.ts // Reply in thread
  });
});
```

### API Integration

```typescript
import { AlertService } from './src/services/AlertService';

const alertService = new AlertService(config);

app.post('/webhook/alerts', async (req, res) => {
  const alert = req.body;
  const result = await alertService.processAlert(alert);
  
  // Send to Slack, save to database, etc.
  await sendToSlack(result.formattedContext);
  
  res.json({ success: true, context: result });
});
```

## 🏗️ Development

### Scripts

```bash
npm run build      # Compile TypeScript
npm run dev        # Run in development mode with ts-node
npm run start      # Run compiled JavaScript
npm run watch      # Watch mode for development
npm run clean      # Clean build directory
```

### Adding New Alert Files

Update the `knownAlertFiles` array in `src/config/index.ts`:

```typescript
knownAlertFiles: [
  'default_alerts/k8s_alerts.yaml',
  'default_alerts/app_alerts.yaml',
  'teams/your-team/alerts.yaml',  // Add your files here
]
```

### Custom Alert Processing

Extend the `AlertService` class:

```typescript
class CustomAlertService extends AlertService {
  async processAlert(alert: Alert): Promise<ContextOutput> {
    // Custom preprocessing
    const processed = await super.processAlert(alert);
    
    // Custom postprocessing
    return this.addCustomContext(processed);
  }
}
```

## 🧪 Testing

Run the examples to test functionality:

```bash
# Test basic functionality
npm run dev examples/basic-usage.ts

# Test Slack integration simulation
npm run dev examples/slack-integration.ts
```

## 🚀 Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["npm", "start"]
```

### Environment Setup

For production deployment:
1. Set environment variables in your deployment platform
2. Ensure GitHub token has appropriate repository access
3. Configure proper logging and monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper TypeScript types
4. Test your changes
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Troubleshooting

### Common Issues

**GitHub 401 Unauthorized**
- Check that your GitHub token is valid
- Ensure token has `repo` scope for private repositories

**GitHub 404 Not Found**
- Verify repository name and owner in configuration
- Check that token has access to the repository

**Alert Not Found**
- Check alert name spelling (exact match required)
- Verify alert exists in configured alert files
- Check that file paths in `knownAlertFiles` are correct

### Debug Mode

Enable verbose logging:

```typescript
const alertService = new AlertService(config);
// Enable debug mode in your custom implementation
```

## 🔮 Future Enhancements

- [ ] Elasticsearch log correlation
- [ ] Historical alert frequency analysis  
- [ ] Machine learning for root cause suggestions
- [ ] Integration with incident management tools
- [ ] Custom alert rule templates
- [ ] Multi-repository support
