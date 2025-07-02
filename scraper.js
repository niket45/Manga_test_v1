const axios = require('axios');
const cheerio =require('cheerio');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// --- 1. INITIALIZE FIREBASE ADMIN SDK ---
try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
} catch (error) {
  console.error("CRITICAL: serviceAccountKey.json not found or invalid. Please check your setup.");
  process.exit(1);
}

const db = admin.firestore();
const bucket = admin.storage().bucket();
console.log('Firebase services initialized.');

// --- 2. SCRAPER FUNCTION ---
async function scrapeImageUrls(chapterUrl) {
  console.log(`Scraping image URLs from: ${chapterUrl}`);
  try {
    const { data } = await axios.get(chapterUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    const $ = cheerio.load(data);
    const imageUrls = [];
    
    // This selector is loaded from your .env file
    $(process.env.MANGA_IMAGE_SELECTOR).each((i, el) => {
      const url = $(el).attr('src') || $(el).attr('data-src');
      if (url) imageUrls.push(url.trim());
    });

    if (imageUrls.length === 0) throw new Error('No images found. Selector is likely wrong or the site uses JavaScript loading.');
    
    console.log(`Found ${imageUrls.length} images.`);
    return imageUrls;
  } catch (error) {
    console.error(`Error scraping image URLs: ${error.message}`);
    return [];
  }
}

// --- 3. UPLOADER FUNCTION ---
async function uploadImageToFirebase(imageUrl, mangaTitle, chapterNum, pageNum) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const sanitizedTitle = mangaTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const destination = `${sanitizedTitle}/${chapterNum}/${String(pageNum).padStart(3, '0')}.jpg`;
    const file = bucket.file(destination);

    await file.save(buffer, {
      metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: uuidv4() } },
      public: true
    });
    
    return file.publicUrl();
  } catch (error) {
    console.error(`Failed to upload page ${pageNum} from ${imageUrl}: ${error.message}`);
    return null;
  }
}

// --- 4. MAIN ORCHESTRATOR ---
async function processChapter(chapterUrl, mangaTitle, chapterNum) {
  const imageUrls = await scrapeImageUrls(chapterUrl);
  if (!imageUrls || imageUrls.length === 0) {
    return { success: false, message: 'Scraping failed: No image URLs were found. Check selector and website.' };
  }

  console.log(`Starting upload for ${mangaTitle} - Chapter ${chapterNum}...`);
  const uploadedImageUrls = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const publicUrl = await uploadImageToFirebase(imageUrls[i], mangaTitle, chapterNum, i + 1);
    if (publicUrl) {
      uploadedImageUrls.push(publicUrl);
      console.log(`  Page ${i + 1}/${imageUrls.length} uploaded successfully.`);
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // 0.5-second delay to be respectful
  }

  if (uploadedImageUrls.length > 0) {
    const chapterId = `${mangaTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${chapterNum}`;
    const chapterRef = db.collection('mangaChapters').doc(chapterId);

    await chapterRef.set({
      mangaTitle,
      chapterNumber: chapterNum,
      sourceUrl: chapterUrl,
      imageUrls: uploadedImageUrls,
      pageCount: uploadedImageUrls.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      message: `Successfully uploaded ${uploadedImageUrls.length} pages.`,
      firstImageUrl: uploadedImageUrls[0]
    };
  } else {
    return { success: false, message: 'Sync failed. No images were uploaded to the cloud.' };
  }
}

// This allows running the scraper directly for testing purposes
// e.g., `npm run test-scrape`
if (require.main === module) {
  (async () => {
    console.log("--- Running Scraper in Test Mode ---");
    const TEST_URL = "https://www.asurascans.com/i-reincarnated-as-a-legendary-surgeon-chapter-45/";
    const TEST_TITLE = "Test Manga";
    const TEST_CHAPTER = "01-test";
    
    if (!TEST_URL) {
      console.log("Please define a test URL in scraper.js to run in test mode.");
      return;
    }
    await processChapter(TEST_URL, TEST_TITLE, TEST_CHAPTER);
    process.exit();
  })();
}

module.exports = { processChapter };
