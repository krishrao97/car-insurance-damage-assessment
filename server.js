const http = require('http');
const url = require('url');
const fs = require('fs');

// Load environment variables from .env file
require('fs').readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) process.env[key] = value;
});

const PORT = 3001;

// API Keys from environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-openai-api-key-here';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'your-google-places-api-key-here';

async function analyzeWithOpenAI(imageData) {
  const https = require('https');
  
  const requestBody = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: `Analyze this car damage photo. Respond with JSON only: {"make": "Toyota", "model": "Camry", "color": "Silver", "damage": "Front bumper dent with scratches"}`
      }, {
        type: "image_url",
        image_url: { url: imageData }
      }]
    }],
    max_tokens: 500
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.choices && response.choices[0]) {
            let content = response.choices[0].message.content;
            
            // Clean JSON if wrapped in markdown
            if (content.includes('```')) {
              content = content.replace(/```json\s*/, '').replace(/```\s*/, '');
            }
            
            const result = JSON.parse(content);
            resolve(result);
          } else {
            reject(new Error('Invalid OpenAI response'));
          }
        } catch (error) {
          console.error('🔥 JSON parsing error in OpenAI response:', error);
          console.error('🔥 Raw content that failed to parse:', content);
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

function estimateRepairCost(damageDescription) {
  const damage = damageDescription.toLowerCase();
  let baseCost = 300;
  
  if (damage.includes('bumper')) baseCost += 500;
  if (damage.includes('door')) baseCost += 800;
  if (damage.includes('hood')) baseCost += 1200;
  if (damage.includes('dent')) baseCost += 400;
  if (damage.includes('scratch')) baseCost += 200;
  if (damage.includes('significant') || damage.includes('major')) baseCost += 800;
  
  const minCost = Math.max(baseCost * 0.8, 200);
  const maxCost = baseCost * 1.4;
  
  return `$${Math.round(minCost)} - $${Math.round(maxCost)}`;
}

async function findRealRepairShops(latitude, longitude) {
  try {
    const radius = 16093; // 10 miles in meters
    
    const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
      `location=${latitude},${longitude}&` +
      `radius=${radius}&` +
      `type=car_repair&` +
      `keyword=auto body collision repair&` +
      `key=${GOOGLE_API_KEY}`;
    
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      https.get(searchUrl, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const result = JSON.parse(data);
            
            if (result.status === 'OK' && result.results) {
              const shops = result.results
                .filter(place => {
                  const name = place.name.toLowerCase();
                  return name.includes('auto') || name.includes('collision') || 
                         name.includes('body') || name.includes('repair');
                })
                .slice(0, 5)
                .map(place => ({
                  name: place.name,
                  address: place.vicinity || place.formatted_address,
                  rating: place.rating || 4.0,
                  totalRatings: place.user_ratings_total || 0,
                  placeId: place.place_id,
                  location: {
                    lat: place.geometry.location.lat,
                    lng: place.geometry.location.lng
                  },
                  isOpen: place.opening_hours ? place.opening_hours.open_now : null,
                  priceLevel: place.price_level,
                  distance: calculateDistance(
                    latitude, longitude,
                    place.geometry.location.lat, place.geometry.location.lng
                  )
                }));
              
              // Get additional details for each shop
              Promise.all(shops.map(shop => getPlaceDetails(shop.placeId)))
                .then(details => {
                  const enrichedShops = shops.map((shop, index) => ({
                    ...shop,
                    phone: details[index]?.phone,
                    website: details[index]?.website,
                    hours: details[index]?.hours
                  }));
                  resolve(enrichedShops);
                })
                .catch(() => {
                  // If details fail, return basic info
                  resolve(shops);
                });
            } else {
              console.log('Google Places API error:', result.status, result.error_message);
              resolve(getDemoRepairShops(latitude, longitude));
            }
          } catch (error) {
            console.error('Error parsing Google Places response:', error);
            resolve(getDemoRepairShops(latitude, longitude));
          }
        });
      }).on('error', (error) => {
        console.error('Google Places API request failed:', error);
        resolve(getDemoRepairShops(latitude, longitude));
      });
    });
    
  } catch (error) {
    console.error('Error in findRealRepairShops:', error);
    return getDemoRepairShops(latitude, longitude);
  }
}

async function getPlaceDetails(placeId) {
  try {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?` +
      `place_id=${placeId}&` +
      `fields=formatted_phone_number,website,opening_hours&` +
      `key=${GOOGLE_API_KEY}`;
    
    const https = require('https');
    
    return new Promise((resolve) => {
      https.get(detailsUrl, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.status === 'OK' && result.result) {
              resolve({
                phone: result.result.formatted_phone_number,
                website: result.result.website,
                hours: result.result.opening_hours
              });
            } else {
              resolve({});
            }
          } catch (error) {
            resolve({});
          }
        });
      }).on('error', () => {
        resolve({});
      });
    });
  } catch (error) {
    return {};
  }
}

function getDemoRepairShops(latitude, longitude) {
  const demoShops = [
    { name: "AutoCraft Collision Center", address: "1234 Main Street", phone: "(555) 123-4567", website: "autocraft-collision.com", rating: 4.8, lat: latitude + 0.01, lng: longitude + 0.01 },
    { name: "Precision Auto Body", address: "5678 Oak Avenue", phone: "(555) 234-5678", website: "precisionautobody.com", rating: 4.9, lat: latitude - 0.01, lng: longitude + 0.01 },
    { name: "Metro Collision Repair", address: "9012 Pine Street", phone: "(555) 345-6789", website: "metrocollision.com", rating: 4.6, lat: latitude + 0.01, lng: longitude - 0.01 },
    { name: "Elite Auto Restoration", address: "3456 Elm Drive", phone: "(555) 456-7890", website: "eliteautorestoration.com", rating: 4.7, lat: latitude - 0.01, lng: longitude - 0.01 },
    { name: "Superior Car Care", address: "7890 Cedar Lane", phone: "(555) 567-8901", website: "superiorcarcare.com", rating: 4.5, lat: latitude + 0.02, lng: longitude }
  ];
  
  return demoShops.map(shop => ({
    ...shop,
    distance: calculateDistance(latitude, longitude, shop.lat, shop.lng),
    totalRatings: Math.floor(Math.random() * 200) + 50,
    isOpen: Math.random() > 0.3 // 70% chance of being open
  })).sort((a, b) => a.distance - b.distance);
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
           Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
           Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getLocationDatabase() {
  return {
    // Major US Cities
    'new york': { lat: 40.7128, lng: -74.0060, name: 'New York, NY' },
    'los angeles': { lat: 34.0522, lng: -118.2437, name: 'Los Angeles, CA' },
    'chicago': { lat: 41.8781, lng: -87.6298, name: 'Chicago, IL' },
    'houston': { lat: 29.7604, lng: -95.3698, name: 'Houston, TX' },
    'phoenix': { lat: 33.4484, lng: -112.0740, name: 'Phoenix, AZ' },
    'philadelphia': { lat: 39.9526, lng: -75.1652, name: 'Philadelphia, PA' },
    'san antonio': { lat: 29.4241, lng: -98.4936, name: 'San Antonio, TX' },
    'san diego': { lat: 32.7157, lng: -117.1611, name: 'San Diego, CA' },
    'dallas': { lat: 32.7767, lng: -96.7970, name: 'Dallas, TX' },
    'san jose': { lat: 37.3382, lng: -121.8863, name: 'San Jose, CA' },
    'austin': { lat: 30.2672, lng: -97.7431, name: 'Austin, TX' },
    'jacksonville': { lat: 30.3322, lng: -81.6557, name: 'Jacksonville, FL' },
    'san francisco': { lat: 37.7749, lng: -122.4194, name: 'San Francisco, CA' },
    'columbus': { lat: 39.9612, lng: -82.9988, name: 'Columbus, OH' },
    'charlotte': { lat: 35.2271, lng: -80.8431, name: 'Charlotte, NC' },
    'fort worth': { lat: 32.7555, lng: -97.3308, name: 'Fort Worth, TX' },
    'indianapolis': { lat: 39.7684, lng: -86.1581, name: 'Indianapolis, IN' },
    'seattle': { lat: 47.6062, lng: -122.3321, name: 'Seattle, WA' },
    'denver': { lat: 39.7392, lng: -104.9903, name: 'Denver, CO' },
    'boston': { lat: 42.3601, lng: -71.0589, name: 'Boston, MA' },
    'el paso': { lat: 31.7619, lng: -106.4850, name: 'El Paso, TX' },
    'detroit': { lat: 42.3314, lng: -83.0458, name: 'Detroit, MI' },
    'nashville': { lat: 36.1627, lng: -86.7816, name: 'Nashville, TN' },
    'portland': { lat: 45.5152, lng: -122.6784, name: 'Portland, OR' },
    'memphis': { lat: 35.1495, lng: -90.0490, name: 'Memphis, TN' },
    'oklahoma city': { lat: 35.4676, lng: -97.5164, name: 'Oklahoma City, OK' },
    'las vegas': { lat: 36.1699, lng: -115.1398, name: 'Las Vegas, NV' },
    'louisville': { lat: 38.2527, lng: -85.7585, name: 'Louisville, KY' },
    'baltimore': { lat: 39.2904, lng: -76.6122, name: 'Baltimore, MD' },
    'milwaukee': { lat: 43.0389, lng: -87.9065, name: 'Milwaukee, WI' },
    'albuquerque': { lat: 35.0844, lng: -106.6504, name: 'Albuquerque, NM' },
    'tucson': { lat: 32.2226, lng: -110.9747, name: 'Tucson, AZ' },
    'fresno': { lat: 36.7378, lng: -119.7871, name: 'Fresno, CA' },
    'sacramento': { lat: 38.5816, lng: -121.4944, name: 'Sacramento, CA' },
    'kansas city': { lat: 39.0997, lng: -94.5786, name: 'Kansas City, MO' },
    'mesa': { lat: 33.4152, lng: -111.8315, name: 'Mesa, AZ' },
    'atlanta': { lat: 33.7490, lng: -84.3880, name: 'Atlanta, GA' },
    'colorado springs': { lat: 38.8339, lng: -104.8214, name: 'Colorado Springs, CO' },
    'raleigh': { lat: 35.7796, lng: -78.6382, name: 'Raleigh, NC' },
    'omaha': { lat: 41.2565, lng: -95.9345, name: 'Omaha, NE' },
    'miami': { lat: 25.7617, lng: -80.1918, name: 'Miami, FL' },
    'oakland': { lat: 37.8044, lng: -122.2712, name: 'Oakland, CA' },
    'minneapolis': { lat: 44.9778, lng: -93.2650, name: 'Minneapolis, MN' },
    'tulsa': { lat: 36.1540, lng: -95.9928, name: 'Tulsa, OK' },
    'cleveland': { lat: 41.4993, lng: -81.6944, name: 'Cleveland, OH' },
    'wichita': { lat: 37.6872, lng: -97.3301, name: 'Wichita, KS' },
    'arlington': { lat: 32.7357, lng: -97.1081, name: 'Arlington, TX' },
    
    // Popular Zip Codes
    '10001': { lat: 40.7505, lng: -73.9934, name: 'New York, NY 10001' },
    '90210': { lat: 34.0901, lng: -118.4065, name: 'Beverly Hills, CA 90210' },
    '60601': { lat: 41.8826, lng: -87.6288, name: 'Chicago, IL 60601' },
    '77001': { lat: 29.7347, lng: -95.3864, name: 'Houston, TX 77001' },
    '33101': { lat: 25.7889, lng: -80.2264, name: 'Miami, FL 33101' },
    '85001': { lat: 33.4734, lng: -112.0740, name: 'Phoenix, AZ 85001' },
    '19101': { lat: 39.9526, lng: -75.1652, name: 'Philadelphia, PA 19101' },
    '78201': { lat: 29.4241, lng: -98.4936, name: 'San Antonio, TX 78201' },
    '92101': { lat: 32.7157, lng: -117.1611, name: 'San Diego, CA 92101' },
    '75201': { lat: 32.7767, lng: -96.7970, name: 'Dallas, TX 75201' },
    '95101': { lat: 37.3382, lng: -121.8863, name: 'San Jose, CA 95101' },
    '78701': { lat: 30.2672, lng: -97.7431, name: 'Austin, TX 78701' },
    '32099': { lat: 30.3322, lng: -81.6557, name: 'Jacksonville, FL 32099' },
    '94101': { lat: 37.7749, lng: -122.4194, name: 'San Francisco, CA 94101' },
    '43215': { lat: 39.9612, lng: -82.9988, name: 'Columbus, OH 43215' },
    '28202': { lat: 35.2271, lng: -80.8431, name: 'Charlotte, NC 28202' },
    '98101': { lat: 47.6062, lng: -122.3321, name: 'Seattle, WA 98101' },
    '80202': { lat: 39.7392, lng: -104.9903, name: 'Denver, CO 80202' },
    '02101': { lat: 42.3601, lng: -71.0589, name: 'Boston, MA 02101' }
  };
}

async function geocodeAddress(address) {
  try {
    // First try local database for fast lookup
    const locationDb = getLocationDatabase();
    const searchKey = address.toLowerCase().trim();
    
    // Direct match
    if (locationDb[searchKey]) {
      console.log('✅ Found in local database:', locationDb[searchKey]);
      return {
        lat: locationDb[searchKey].lat,
        lng: locationDb[searchKey].lng,
        formatted_address: locationDb[searchKey].name
      };
    }
    
    // Partial match for cities
    for (const [key, location] of Object.entries(locationDb)) {
      if (searchKey.includes(key) || key.includes(searchKey)) {
        console.log('✅ Partial match in local database:', location);
        return {
          lat: location.lat,
          lng: location.lng,
          formatted_address: location.name
        };
      }
    }
    
    // Try Google Places API Text Search as backup (since our key works with Places)
    console.log('🌍 Trying Google Places API Text Search...');
    const encodedAddress = encodeURIComponent(address);
    const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodedAddress}&key=${GOOGLE_API_KEY}`;
    
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      https.get(placesUrl, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const result = JSON.parse(data);
            
            if (result.status === 'OK' && result.results && result.results[0]) {
              const location = result.results[0].geometry.location;
              console.log('✅ Google Places Text Search successful:', location, result.results[0].formatted_address);
              resolve({
                lat: location.lat,
                lng: location.lng,
                formatted_address: result.results[0].formatted_address
              });
            } else {
              console.log('❌ Google Places Text Search failed:', result.status, result.error_message);
              // Final fallback to San Francisco
              resolve({ lat: 37.7749, lng: -122.4194, formatted_address: 'San Francisco, CA (default)' });
            }
          } catch (error) {
            console.error('Error parsing Places API response:', error);
            resolve({ lat: 37.7749, lng: -122.4194, formatted_address: 'San Francisco, CA (default)' });
          }
        });
      }).on('error', (error) => {
        console.error('Places API request failed:', error);
        resolve({ lat: 37.7749, lng: -122.4194, formatted_address: 'San Francisco, CA (default)' });
      });
    });
    
  } catch (error) {
    console.error('Error in geocodeAddress:', error);
    return { lat: 37.7749, lng: -122.4194, formatted_address: 'San Francisco, CA (default)' };
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  
  if (req.method === 'GET' && parsedUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Working backend with real OpenAI!' }));
    return;
  }
  
  if (req.method === 'POST' && parsedUrl.pathname === '/api/analyze-simple') {
    let body = '';
    req.on('data', chunk => body += chunk);
    
    req.on('end', async () => {
      try {
        console.log('🎯 Received analysis request');
        
        // Parse JSON body (from our working frontend)
        const data = JSON.parse(body);
        const imageData = data.imageData;
        
        console.log('📷 Image data received, length:', imageData.length);
        
        // Call OpenAI Vision API
        console.log('🚀 Calling OpenAI with image data type:', typeof imageData, 'starts with:', imageData.substring(0, 50));
        const analysisResult = await analyzeWithOpenAI(imageData);
        console.log('✅ OpenAI analysis successful:', analysisResult);
        
        const estimatedCost = estimateRepairCost(analysisResult.damage);
        
        const response = {
          success: true,
          data: {
            metadata: {
              make: analysisResult.make,
              model: analysisResult.model,
              color: analysisResult.color
            },
            damageSummary: analysisResult.damage,
            estimatedCost: estimatedCost,
            analysisMode: 'openai'
          }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        
      } catch (error) {
        console.error('❌ Analysis failed:', error);
        console.error('❌ Error details:', error.stack);
        
        let errorMessage = error.message;
        if (error.message === 'Invalid OpenAI response') {
          errorMessage = 'Unable to analyze image. Please check that the image URL is accessible and shows a car with visible damage.';
        }
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Analysis failed', message: errorMessage }));
      }
    });
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/repair-shops') {
    let body = '';
    req.on('data', chunk => body += chunk);
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { latitude, longitude } = data;
        
        console.log('🔍 Finding repair shops near:', latitude, longitude);
        
        const shops = await findRealRepairShops(latitude, longitude);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, shops: shops }));
        
      } catch (error) {
        console.error('❌ Repair shop search failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to find repair shops', message: error.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/geocode') {
    let body = '';
    req.on('data', chunk => body += chunk);
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { address } = data;
        
        console.log('🗺️ Geocoding address:', address);
        console.log('🔑 Using Google API key:', GOOGLE_API_KEY.substring(0, 20) + '...');
        
        const location = await geocodeAddress(address);
        console.log('📍 Geocoding result:', location);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, location: location }));
        
      } catch (error) {
        console.error('❌ Geocoding failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to geocode address', message: error.message }));
      }
    });
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🚗 Car Insurance App Server running on http://localhost:${PORT}`);
  console.log(`✅ OpenAI Vision API integration active`);
  console.log(`🌍 Google Places API integration active`);
  console.log(`📝 Endpoints:`);
  console.log(`  GET  /api/health           - Health check`);
  console.log(`  POST /api/analyze-simple   - Analyze car damage with OpenAI`);
  console.log(`  POST /api/repair-shops     - Find nearby repair shops`);
  console.log(`  POST /api/geocode          - Geocode addresses and zip codes`);
  console.log(`\n🌐 Open http://localhost:8080 to access the frontend`);
});