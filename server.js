const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const CENTRES = [
    { code: 'LDNLT', name: 'Loughton', address: 'Loughton, Essex, IG10 1RB' },
    { code: 'LDNHS', name: 'Hounslow', address: 'Hounslow, TW3 1NL' },
    { code: 'LDNMH', name: 'Mill Hill', address: 'Mill Hill, NW7 3HU' },
    { code: 'LDNTD', name: 'Toddington', address: 'Toddington, LU5 6HR' },
    { code: 'LDNWG', name: 'Wood Green', address: 'Wood Green, N22 6UJ' },
    { code: 'LDNYV', name: 'Yelverton', address: 'Yelverton, NW10 7LJ' },
    { code: 'LDNMD', name: 'Morden', address: 'Morden, SM4 5BH' },
    { code: 'LDNER', name: 'Erith', address: 'Erith, DA8 1QD' },
    { code: 'LDNGM', name: 'Goodmayes', address: 'Goodmayes, IG3 9UB' }
];

let sessionCookie = null;
let lastScanResults = { centres: [], summary: {}, timestamp: null };

// Try to load cookie
try {
    if (fs.existsSync('./cookie.txt')) {
        sessionCookie = fs.readFileSync('./cookie.txt', 'utf8').trim();
    }
} catch(e) {}

const client = axios.create({
    timeout: 15000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    }
});

client.interceptors.request.use(config => {
    if (sessionCookie) {
        config.headers['Cookie'] = sessionCookie;
    }
    // Rotate User-Agent slightly
    config.headers['User-Agent'] = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(Math.random() * 20 + 110)}.0.0.0 Safari/537.36`;
    return config;
});

// Random delay between requests (looks human)
const randomDelay = () => new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));

async function checkCentre(centre) {
    try {
        const url = `https://driverpracticaltest.dvsa.gov.uk/booking?centreCode=${centre.code}`;
        const response = await client.get(url);
        const html = response.data;
        
        let hasSlots = false;
        let dates = [];
        
        // Multiple detection methods
        if (html.includes('available-date') || html.includes('slot-available') || html.includes('test-centre-available')) {
            hasSlots = true;
        }
        
        const dateRegex = /data-date="([^"]+)"/g;
        let match;
        while ((match = dateRegex.exec(html)) !== null) {
            dates.push(match[1]);
            hasSlots = true;
        }
        
        // Check for time slots
        const timeSlots = html.match(/time-slot/g);
        if (timeSlots && timeSlots.length > 0) hasSlots = true;
        
        return {
            code: centre.code,
            name: centre.name,
            address: centre.address,
            hasSlots: hasSlots,
            slotCount: dates.length,
            availableDates: dates.slice(0, 10),
            lastChecked: new Date().toISOString()
        };
        
    } catch(e) {
        return {
            code: centre.code,
            name: centre.name,
            address: centre.address,
            hasSlots: false,
            error: e.message,
            lastChecked: new Date().toISOString()
        };
    }
}

async function scanAllCentres() {
    console.log('🔍 Scan started at', new Date().toISOString());
    const results = [];
    
    for (const centre of CENTRES) {
        const result = await checkCentre(centre);
        results.push(result);
        console.log(`${result.hasSlots ? '✅' : '❌'} ${result.name}: ${result.hasSlots ? result.slotCount + ' slots' : 'No slots'}`);
        await randomDelay();
    }
    
    const centresWithSlots = results.filter(r => r.hasSlots).length;
    const totalSlots = results.reduce((sum, r) => sum + (r.slotCount || 0), 0);
    
    lastScanResults = {
        timestamp: new Date().toISOString(),
        centres: results,
        summary: {
            totalCentres: CENTRES.length,
            centresWithSlots: centresWithSlots,
            totalSlots: totalSlots,
            lastScanTime: new Date().toISOString()
        }
    };
    
    // Save results
    fs.writeFileSync('public/data.json', JSON.stringify(lastScanResults, null, 2));
    
    console.log(`✅ Scan complete: ${centresWithSlots} centres have slots, ${totalSlots} total slots`);
    
    return lastScanResults;
}

// If run directly
if (require.main === module) {
    scanAllCentres().catch(console.error);
}

module.exports = { scanAllCentres, lastScanResults };
