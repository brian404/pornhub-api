const axios = require('axios');
const cheerio = require('cheerio');
const sanitizeHtml = require('sanitize-html');
const { getRandomUserAgent } = require('./ua-rotate');

const categoryMap = {};

const populateCategories = async () => {
    try {
        const url = 'https://www.pornhub.com/categories';
        const ua = getRandomUserAgent();
        console.log(`Fetching categories with UA: ${ua}`);
        
        const { data } = await axios.get(url, { 
            headers: { 'User-Agent': ua } 
        });
        
        const $ = cheerio.load(data);
        let categoriesData = null;

        $('script').each((i, elem) => {
            const scriptContent = $(elem).html();
            if (scriptContent && scriptContent.includes('allCategoriesCombined')) {
                const match = scriptContent.match(/allCategoriesCombined = JSON\.parse\('(.+?)'\);/);
                if (match && match[1]) {
                    categoriesData = JSON.parse(match[1].replace(/\\"/g, '"'));
                }
            }
        });

        if (!categoriesData) {
            throw new Error('Could not find allCategoriesCombined in the page');
        }

        categoriesData.forEach(category => {
            const name = category.name.toLowerCase().replace(/\s+/g, '-');
            const id = category.id;
            if (name && id) {
                categoryMap[name] = id;
            }
        });

        console.log('Category mapping initialized with', Object.keys(categoryMap).length, 'categories');
    } catch (error) {
        console.error('Failed to initialize category mapping:', error.message);
    }
};

populateCategories();

const getTrendingVideos = async (req, res) => {
    try {
        const url = 'https://www.pornhub.com/video';
        const ua = getRandomUserAgent();
        console.log(`Fetching trending videos with UA: ${ua}`);
        
        const { data } = await axios.get(url, { 
            headers: { 'User-Agent': ua } 
        });
        
        const $ = cheerio.load(data);
        let trendingVideos = new Set();

        $('a[href^="/view_video.php?viewkey="]').each((index, element) => {
            let videoKeyMatch = $(element).attr('href').match(/viewkey=([^&]+)/);
            if (videoKeyMatch && videoKeyMatch[1]) trendingVideos.add(videoKeyMatch[1]);
            if (trendingVideos.size >= 10) return false;
        });

        res.json({ trending: [...trendingVideos] });
    } catch (error) {
        console.error("Error fetching trending videos:", error.message);
        res.status(500).json({ error: 'Failed to fetch trending videos' });
    }
};

const getRandomVideo = async (req, res) => {
    try {
        const url = 'https://www.pornhub.com/video';
        const ua = getRandomUserAgent();
        console.log(`Fetching random video with UA: ${ua}`);
        
        const { data } = await axios.get(url, { 
            headers: { 'User-Agent': ua } 
        });
        
        const $ = cheerio.load(data);
        let videoIds = [];

        $('a[href^="/view_video.php?viewkey="]').each((index, element) => {
            let videoKeyMatch = $(element).attr('href').match(/viewkey=([^&]+)/);
            if (videoKeyMatch && videoKeyMatch[1]) videoIds.push(videoKeyMatch[1]);
        });

        const randomId = videoIds[Math.floor(Math.random() * videoIds.length)];
        res.json({ randomVideo: randomId });
    } catch (error) {
        console.error("Error fetching random video:", error.message);
        res.status(500).json({ error: 'Failed to fetch random video' });
    }
};

const getCategories = async (req, res) => {
    try {
        if (Object.keys(categoryMap).length === 0) {
            await populateCategories();
        }
        if (Object.keys(categoryMap).length === 0) {
            throw new Error('Category mapping failed to initialize');
        }

        const categories = Object.entries(categoryMap).map(([name, id]) => ({ name, id }));
        res.json({ categories });
    } catch (error) {
        console.error("Error fetching categories:", error.message);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
};

const getVideoDetails = async (req, res) => {
    try {
        const videoId = req.params.id;
        const url = `https://www.pornhub.com/view_video.php?viewkey=${videoId}`;
        const ua = getRandomUserAgent();
        console.log(`Fetching video details for ${videoId} with UA: ${ua}`);
        
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.pornhub.com/'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(data);
        let title = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content');
        
        if (!title) {
            const jsonLd = $('script[type="application/ld+json"]').html();
            if (jsonLd) {
                try {
                    const json = JSON.parse(jsonLd);
                    title = json.name;
                } catch (e) {
                    console.warn(`Failed to parse JSON-LD for ${videoId}`);
                }
            }
        }
        if (!title) {
            title = $('title').text().trim().replace(/ \| Pornhub$/, '');
        }
        
        title = sanitizeHtml(title, { allowedTags: [] }).replace(/\s+/g, ' ').trim() || `Untitled Video (${videoId})`;
        
        const videoUrl = url;
        let length = $('.video-info-row .duration').first().text().trim() ||
                     $('.duration').first().text().trim() ||
                     "Unknown";
        let thumbnail = $('meta[property="og:image"]').attr('content') || 
                        $('img[data-thumb_url]').attr('data-thumb_url') || 
                        "Thumbnail not found";

        res.json({ 
            video_id: videoId, 
            title, 
            url: videoUrl, 
            length, 
            thumbnail 
        });
    } catch (error) {
        console.error(`Error fetching video details for ${req.params.id}:`, error.message);
        res.status(404).json({ error: 'Video not found or failed to fetch' });
    }
};

const downloadVideo = async (req, res) => {
    try {
        const videoId = req.params.id;
        const pageUrl = `https://www.pornhub.com/view_video.php?viewkey=${videoId}`;
        const apiUrl = `http://80.211.131.188:5577/api/ytdlp?url=${encodeURIComponent(pageUrl)}`;
        console.log(`Requesting video ${videoId} from custom API`);

        const videoResponse = await axios({
            method: 'get',
            url: apiUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': pageUrl
            },
            timeout: 30000
        });

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `inline; filename="${videoId}.mp4"`);
        videoResponse.data.pipe(res);

        videoResponse.data.on('end', () => console.log(`Finished streaming video ${videoId}`));
        videoResponse.data.on('error', (err) => {
            console.error(`Stream error for video ${videoId}:`, err.message);
            if (!res.headersSent) res.status(500).end();
        });
    } catch (error) {
        console.error(`Error downloading video ${req.params.id}:`, error.message);
        if (error.code === 'ECONNREFUSED') {
            res.status(503).json({ error: 'Custom API unavailable' });
        } else if (error.code === 'ETIMEDOUT') {
            res.status(504).json({ error: 'Request timed out' });
        } else {
            res.status(500).json({ error: 'Failed to stream video' });
        }
    }
};

const getCategoryVideos = async (req, res) => {
    try {
        const categoryName = req.params.name.toLowerCase().replace(/\s+/g, '-');
        if (!categoryName) {
            return res.status(400).json({ error: 'Category parameter is required' });
        }

        if (Object.keys(categoryMap).length === 0) {
            await populateCategories();
        }

        const categoryId = categoryMap[categoryName];
        if (!categoryId) {
            return res.status(404).json({ 
                error: `Category '${categoryName}' not found`, 
                hint: 'Check /api/categories for valid names' 
            });
        }

        const url = `https://www.pornhub.com/video?c=${categoryId}`;
        const ua = getRandomUserAgent();
        
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': ua }
        });

        const $ = cheerio.load(data);
        let videoIds = new Set();

        $('a[href^="/view_video.php?viewkey="]').each((index, element) => {
            const videoKey = $(element).attr('href').match(/viewkey=([^&]+)/);
            if (videoKey && videoKey[1]) {
                videoIds.add(videoKey[1]);
            }
            if (videoIds.size >= 20) return false;
        });

        if (videoIds.size === 0) {
            return res.status(404).json({ error: 'No videos found for this category' });
        }

        res.json({ category: categoryName, videos: [...videoIds] });
    } catch (error) {
        console.error(`Error fetching category videos:`, error.message);
        res.status(500).json({ error: 'Failed to fetch category videos' });
    }
};

module.exports = {
    getTrendingVideos,
    getRandomVideo,
    getCategories,
    getVideoDetails,
    downloadVideo,
    getCategoryVideos
};
