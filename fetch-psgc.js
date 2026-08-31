import fs from 'fs';
import path from 'path';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

async function main() {
  try {
    console.log('Fetching regions...');
    const regions = await fetchJson('https://psgc.gitlab.io/api/regions');

    console.log('Fetching provinces...');
    const provinces = await fetchJson('https://psgc.gitlab.io/api/provinces');

    console.log('Fetching cities/municipalities...');
    const cities = await fetchJson('https://psgc.gitlab.io/api/cities-municipalities');

    console.log('Fetching barangays...');
    const barangays = await fetchJson('https://psgc.gitlab.io/api/barangays');

    const psgcData = {
      regions,
      provinces,
      cities,
      barangays
    };

    const outputPath = path.resolve(process.cwd(), 'public', 'psgc.json');
    fs.writeFileSync(outputPath, JSON.stringify(psgcData, null, 2));
    console.log(`PSGC data saved to ${outputPath}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();