# Car Insurance Damage Assessment - V2

A complete car insurance damage assessment application with AI-powered image analysis and repair shop finder.

## Features

- **Step 1: Image Upload** - Upload car damage photos via file or drag & drop
- **Step 2: AI Analysis** - Real OpenAI Vision API integration for:
  - Vehicle identification (make, model, color)
  - Damage assessment and description
  - Repair cost estimation
- **Step 3: Repair Shop Finder** - Real Google Places API integration for:
  - Current location detection
  - Nearby auto body shop search
  - Contact information and ratings
  - Distance calculations

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js HTTP Server (no dependencies)
- **APIs**: OpenAI Vision API, Google Places API
- **Styling**: Geico-inspired brand colors and design

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- OpenAI API Key
- Google Places API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/car-insurance-damage-assessment.git
   cd car-insurance-damage-assessment
   ```

2. **Configure API Keys**
   
   Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```
   OPENAI_API_KEY=your-openai-api-key-here
   GOOGLE_API_KEY=your-google-places-api-key-here
   ```

3. **Start the Backend Server**
   ```bash
   node server.js
   ```
   
   You should see:
   ```
   🚗 Car Insurance App Server running on http://localhost:3001
   ✅ OpenAI Vision API integration active
   🌍 Google Places API integration active
   ```

4. **Start a Web Server** (in a new terminal)
   ```bash
   python3 -m http.server 8000
   ```
   
   Or use any other local web server.

5. **Open the Application**
   
   Navigate to: http://localhost:8000

## Usage

1. **Upload Image**: Select a car damage photo or drag & drop
2. **AI Analysis**: Click "Analyze with Real OpenAI" to get instant assessment
3. **Find Shops**: Use current location or enter a city to find nearby repair shops
4. **Contact Shops**: Call or visit websites directly from the results

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/analyze-simple` - Analyze car damage with OpenAI
- `POST /api/repair-shops` - Find nearby repair shops

## File Structure

```
car_insurance_prototype_app_v2/
├── index.html          # Main frontend application
├── server.js           # Backend API server
└── README.md          # This file
```

## API Keys Setup

### OpenAI API Key
1. Go to https://platform.openai.com/
2. Create an account and generate an API key
3. Replace `OPENAI_API_KEY` in `server.js`

### Google Places API Key
1. Go to https://console.cloud.google.com/
2. Enable Places API
3. Generate an API key
4. Replace `GOOGLE_API_KEY` in `server.js`

## Features in Detail

### OpenAI Vision Analysis
- Uses GPT-4 Vision model for accurate car damage assessment
- Extracts vehicle metadata (make, model, color)
- Provides detailed damage descriptions
- Estimates repair costs based on damage type

### Google Places Integration
- Searches for auto body shops, collision centers, and car repair services
- Filters results by automotive repair keywords
- Provides contact information, ratings, and hours
- Calculates distances from user location

### Professional UI
- Geico-inspired color scheme (#0033A0 blue, #78BE20 green)
- Responsive design for mobile and desktop
- Clear 3-step workflow
- Real-time status indicators
- Error handling and fallbacks

## Troubleshooting

- **CORS Errors**: Make sure to serve the HTML via HTTP server, not file://
- **API Failures**: Check console for error messages and verify API keys
- **Port Conflicts**: Change PORT in server.js if 3001 is in use

## Development Notes

- No external dependencies required for the backend
- Uses vanilla JavaScript for maximum compatibility
- Includes fallback demo data if APIs fail
- Implements proper error handling throughout

## License

This is a prototype application for demonstration purposes.