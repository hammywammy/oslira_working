# Oslira - AI-Powered Lead Generation Platform

[![Deploy Status](https://api.netlify.com/api/v1/badges/your-site-id/deploy-status)](https://app.netlify.com/sites/oslira/deploys)

> AI platform for lead research, analysis, and personalized outreach generation.

## 🚀 Development Setup

### Prerequisites
- Node.js 18.x or higher
- Supabase account with database setup
- Stripe account for payment processing
- Cloudflare Workers account

### Local Development
```bash
# Clone the repository
git clone [repository-url]
cd oslira-frontend

# No npm install needed - this is a static HTML/CSS/JS project

# Copy environment template  
cp config.example.js config.js

# Configure your API keys in config.js
# Edit config.js with your Supabase credentials

# Serve locally (use any static server)
python -m http.server 8000
# or
npx serve .
```

Visit `http://localhost:8000` to access the development environment.

## 📋 Configuration

### JavaScript Configuration
Create a `config.js` file with your credentials:

```javascript
const CONFIG = {
    supabaseUrl: 'https://jswzzihuqtjqvobfosks.supabase.co',
    supabaseKey: 'your-supabase-anon-key-here'
};
```

### Database Setup
Run the SQL schema in your Supabase SQL editor:

```sql
-- Tables needed: users, business_profiles, leads, credit_transactions
-- Full schema available in the SQL artifacts provided
```

### Required Services
- **Supabase**: Database, authentication, real-time updates
- **Stripe**: Payment processing for subscriptions
- **Cloudflare Workers**: API backend for AI processing

## 🏗️ Architecture

### Frontend Stack
- **Framework**: Static HTML/CSS/JavaScript
- **Styling**: Custom CSS with modern design system
- **Authentication**: Supabase Auth with magic links
- **Database**: Supabase (PostgreSQL with RLS)
- **Payment Processing**: Stripe subscription model

### Backend Infrastructure
- **API**: Cloudflare Workers for AI processing
- **Database**: Supabase with Row Level Security
- **Authentication**: Supabase JWT tokens
- **Hosting**: Netlify for static files

### Deployment Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Netlify CDN   │───▶│  Supabase DB     │───▶│ Cloudflare      │
│   Static Files  │    │  Auth & Storage  │    │ Workers API     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         ▼                        ▼                       ▼
   User Requests              Real-time Updates      AI Processing
```

## 📁 Project Structure

```
oslira-frontend/
├── 📁 assets/                   # Images, icons, logos
├── 📄 index.html               # Landing page
├── 📄 auth.html                # Authentication page
├── 📄 onboarding.html          # User onboarding flow
├── 📄 dashboard.html           # Main dashboard
├── 📄 pricing.html             # Pricing page
├── 📄 security.html            # Security information
├── 📄 privacy.html             # Privacy policy
├── 📄 disclaimer.html          # Legal disclaimer
├── 📄 refund.html              # Refund policy
├── 📄 terms.html               # Terms of service
├── 📄 config.js                # Configuration file (gitignored)
├── 📄 config.example.js        # Configuration template
├── 📁 cloudflare-workers/      # API backend
│   ├── src/                    # Worker source code
│   └── wrangler.toml          # Cloudflare config
├── 📁 sql/                     # Database schemas
│   └── complete-schema.sql     # Full database setup
└── README.md                   # This file
```

## 🚀 Deployment

### Static File Hosting
The frontend is static HTML/CSS/JS files that can be hosted anywhere:
- **Netlify** (current setup)
- **Vercel**
- **GitHub Pages**
- **Any static hosting service**

### API Backend
```bash
# Deploy Cloudflare Worker
cd cloudflare-workers
npx wrangler deploy
```

### Database
- Set up Supabase project
- Run the SQL schema
- Configure RLS policies

## 🔧 Development

### Technology Stack
- **Frontend**: Pure HTML/CSS/JavaScript (no build process)
- **Database**: Supabase (PostgreSQL)
- **API**: Cloudflare Workers
- **Authentication**: Supabase Auth
- **Payments**: Stripe
- **Hosting**: Netlify

### Key Features Implemented
- User authentication and onboarding
- Subscription + credits billing model
- AI lead analysis via Cloudflare Workers
- Real-time dashboard with lead management
- Legal pages (privacy, terms, disclaimer, refund)
- Responsive design across all pages

## 🛡️ Security

### Current Implementation
- **Authentication**: Supabase Auth with magic links
- **Database Security**: Row Level Security (RLS) 
- **API Protection**: JWT token validation
- **Payment Security**: Stripe Elements
- **HTTPS**: TLS encryption for all communications

### Database Security
All tables use Row Level Security to ensure users can only access their own data.

## 📊 Current Features

### Implemented
- ✅ **User Authentication**: Magic link login via Supabase
- ✅ **Onboarding Flow**: 5-step business profile setup  
- ✅ **Subscription Billing**: Monthly plans with included credits
- ✅ **Lead Analysis**: AI-powered Instagram profile analysis
- ✅ **Dashboard**: Lead management and analytics
- ✅ **Legal Pages**: Privacy, terms, disclaimer, refund policies
- ✅ **Responsive Design**: Mobile-friendly across all pages

### Technical Implementation
- Credit-based analysis system (1-2 credits per analysis)
- Real-time dashboard updates via Supabase
- AI analysis via Cloudflare Workers API
- Stripe integration for subscription management
- Row Level Security for data protection

## 🔄 API Integration

### Authentication
```javascript
// Include Supabase session token in requests
const { data: { session } } = await supabase.auth.getSession();
headers: {
  'Authorization': `Bearer ${session.access_token}`,
  'Content-Type': 'application/json'
}
```

### Cloudflare Workers API
```javascript
// Example: Analyze lead profile
const response = await fetch('https://ai-outreach-api.your-domain.workers.dev/analyze', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    profile_url: 'https://instagram.com/username',
    analysis_type: 'deep',
    business_id: 'user-business-id'
  })
});
```

## 📈 Monitoring & Analytics

### Performance Monitoring
- **Uptime**: 99.9% SLA with status page
- **Response Times**: < 200ms average API response
- **Error Tracking**: Comprehensive error logging
- **User Analytics**: Privacy-compliant usage tracking

### Business Metrics
- Monthly Recurring Revenue (MRR)
- Customer Acquisition Cost (CAC)
- Lifetime Value (LTV)
- Churn rate and retention metrics
- Feature adoption rates

## 🤝 Contributing

### Development Guidelines
This is a static HTML/CSS/JavaScript project focused on:
1. Clean, maintainable code
2. Responsive design principles  
3. Supabase integration patterns
4. Stripe payment flows
5. Real-time dashboard updates

### Areas for Contribution
- UI/UX improvements
- Additional payment integrations
- Enhanced analytics features
- Mobile app development
- API optimizations
- Database schema improvements

### Getting Started
1. Set up your own Supabase project
2. Configure the database schema
3. Add your API credentials to config.js
4. Start with local development
5. Test with your own data

## 📞 Technical Support

### Architecture Questions
- Supabase integration patterns
- Cloudflare Workers development
- Stripe subscription implementation
- Real-time dashboard design

### Development Resources
- [Supabase Documentation](https://supabase.com/docs)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Stripe API Reference](https://stripe.com/docs/api)

---

## 🎯 Development Roadmap

### Potential Improvements
- [ ] Email integration capabilities
- [ ] Advanced analytics dashboard
- [ ] Bulk analysis features
- [ ] Mobile-responsive optimizations
- [ ] Additional payment gateways
- [ ] Enhanced AI model integration
- [ ] Team collaboration features
- [ ] Advanced export options

---

**Technical Stack**: Static HTML/CSS/JS + Supabase + Cloudflare Workers + Stripe

*Built for developers who want to understand modern SaaS architecture with AI integration.*
