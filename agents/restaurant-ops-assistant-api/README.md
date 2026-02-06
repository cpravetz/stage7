# Restaurant Operations Assistant API

A comprehensive AI-powered restaurant operations assistant that supports restaurant staff across front-of-house, back-of-house, and management functions.

## Features

### Front-of-House Management
- **Reservation System**: Comprehensive reservation management with availability checking, waitlist management, and guest profile integration
- **Table Management**: Optimized table assignments, turnover tracking, and floor plan visualization
- **Service Flow**: Real-time service coordination, course timing, and table progress tracking
- **Guest Profiles**: Detailed guest history with preferences, dietary restrictions, and VIP identification

### Staff Management
- **Scheduling**: Optimized staff schedules balancing labor costs and coverage needs
- **Demand Forecasting**: Customer volume prediction using historical data and external factors
- **Labor Analytics**: Labor cost analysis, productivity tracking, and efficiency metrics
- **Communication**: Real-time messaging between front and back-of-house staff

### Kitchen Operations
- **Prep Scheduling**: Prioritized prep lists based on demand forecasts and inventory levels
- **Kitchen Display**: Order management with ticket prioritization and station coordination
- **Station Coordination**: Workload balancing and bottleneck identification across kitchen stations
- **Recipe Management**: Standardized recipes with costing, scaling, and version control

### Menu and Cost Management
- **Recipe Costing**: Accurate food cost calculation including waste factors
- **Menu Engineering**: Profitability and popularity analysis using menu engineering matrix
- **Menu Optimization**: Pricing adjustments, item recommendations, and menu mix optimization
- **Pricing Strategy**: Competitive benchmarking and strategic pricing recommendations

### Inventory and Purchasing
- **Inventory Tracking**: Real-time stock level monitoring with usage patterns
- **Purchase Orders**: Automated order generation based on par levels and supplier terms
- **Supplier Management**: Comparative pricing, performance tracking, and relationship management
- **Order Optimization**: Consolidated orders to minimize delivery fees and maximize freshness
- **Waste Management**: Waste tracking, pattern analysis, and reduction recommendations
- **Price Tracking**: Ingredient price monitoring with trend analysis and alerts

### Financial Analytics
- **Financial Reporting**: Comprehensive P&L statements, cost analysis, and performance metrics
- **Variance Analysis**: Identification and explanation of deviations from budgeted performance
- **Trend Analysis**: Pattern identification in sales, costs, and operational performance
- **Sales Analytics**: Performance analysis by item, category, daypart, and server

### Operational Tools
- **Reservation Analytics**: Booking pattern analysis, no-show tracking, and demand forecasting
- **Table Turnover**: Turnover rate optimization while maintaining guest satisfaction
- **Quality Control**: Food quality monitoring, portion control, and standards enforcement
- **Guest Feedback**: Review collection, sentiment analysis, and issue identification

## API Endpoints

### REST API
- `POST /api/restaurant-ops-assistant/conversations` - Start a new conversation
- `POST /api/restaurant-ops-assistant/conversations/:id/messages` - Send a message to a conversation
- `GET /api/restaurant-ops-assistant/conversations/:id/messages` - Get conversation history
- `GET /health` - Health check endpoint

### WebSocket
- `ws://localhost:3005/ws/restaurant-ops-assistant/conversations/{id}` - Real-time conversation events

## Installation

```bash
npm install
```

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Docker

```bash
docker build -t restaurant-ops-assistant-api .
docker run -p 3005:3005 restaurant-ops-assistant-api
```

## Configuration

The assistant requires connection to the CKT MCS Core Engine at `http://localhost:5030`.

## Usage Examples

### Starting a Reservation Conversation
```javascript
const response = await fetch('http://localhost:3005/api/restaurant-ops-assistant/conversations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    initialPrompt: 'Book a table for 6 tonight at 7pm with dietary restrictions'
  })
});
```

### Staff Scheduling
```javascript
const response = await fetch('http://localhost:3005/api/restaurant-ops-assistant/conversations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    initialPrompt: 'Create next week\'s staff schedule for 200 expected covers per night'
  })
});
```

### Menu Engineering
```javascript
const response = await fetch('http://localhost:3005/api/restaurant-ops-assistant/conversations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    initialPrompt: 'Analyze menu profitability and suggest optimization strategies'
  })
});
```

## Architecture

The Restaurant Operations Assistant follows the CKT MCS v2 architecture with:
- **L1 Core Engine Integration**: For plan execution and tool orchestration
- **Modular Tool Design**: Specialized tools for each operational domain (located in `@cktmcs/sdk/src/tools/restaurant`)
- **Human-in-the-Loop**: Interactive decision points for critical operations
- **Real-time WebSocket**: Event-driven communication for dynamic operations
- **Shared SDK Tools**: All restaurant tools are available in the SDK for potential use by other assistants

## Service Discovery

The assistant automatically registers with the PostOffice service discovery system for inter-service communication within the CKT MCS ecosystem.