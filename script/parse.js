'use strict';

/* Includes */
const TurndownService = require('turndown');
const parseString = require('xml2js').parseString;
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const {promisify} = require('util');
const compressImages = require('./compressImages');

var turndownService = new TurndownService();

const preparePage = async (url, page) => {
    const bodyHandle = await page.$('body');
    await page.evaluate(body => {
        var imagesToRemove = body.querySelectorAll('.padding10');
        var title = body.querySelector('.padding10+b');
        title && title.parentNode.removeChild(title);
        imagesToRemove && imagesToRemove.forEach(image => image && image.parentNode.removeChild(image));
    }, bodyHandle);
    await bodyHandle.dispose();
};

const getPageData = async (url, page) => {
    const bodyHandle = await page.$('body');
    const title = await page.title();
    const date = await page.evaluate(body => {
        var content = body.querySelector('.all_content');
        var date = content && Array.prototype.slice.call(content.childNodes).reduce((accumulator, element) => {
            if (element.nodeType === Node.TEXT_NODE && element.textContent && element.textContent.includes('Дата')) {
                return element.textContent.replace('Дата: ', '').trim();
            } else {
                return accumulator;
            }
        }, '');
        return date;
    }, bodyHandle);
    var html = await page.evaluate(body => {
        var images = body.querySelectorAll('.all_content img');
        images && images.forEach(image => {
            if (image) {
                var srcParts = image.src.split('/');
                image.src = '/assets/' + srcParts[srcParts.length - 1];
            }
        });
        var content = body.querySelector('.all_content');
        return content ? content.innerHTML : null;
    }, bodyHandle);
    await bodyHandle.dispose();
    var pageData = {
        title: title,
        html: html,
        layout: getPagePath(url).includes('news') ? 'post' : 'page'
    }
    if (date) {
        pageData.date = date;
    }
    return pageData;
};

const convertHtmlToMd = (html) => {
    if (!html || !html.html) {
        return null;
    }
    const markdown = turndownService.turndown(html.html);
    return '---\n' + `layout: ${html.layout}\n` + `title:  ${html.title}\n` + (html.date ? `date:   ${html.date}\n` : '') + '---\n' + markdown;
};

const downloadImages = async (url, page) => {
    const bodyHandle = await page.$('body');
    const baseUrl = getBaseUrl(url);
    const urls = await page.evaluate((body, baseUrl) => {
        const images = body.querySelectorAll('.all_content img');
        return images && Array.prototype.slice.call(images).map(image => image.src);
    }, bodyHandle, baseUrl);
    for (let url of urls) {
        try {
            await download(url);
        } catch(e) {
            console.log(e);
        }
    }
    await bodyHandle.dispose();
};

async function download(url) {
    const res = await fetch(url);
    const filePath = getFilePath(url);
    const folder = filePath.split('/').splice(0, 2).join('/');
    try {
        await promisify(fs.mkdir)(folder);
    } catch (error) {
        console.log(`folder ${folder} exists`);
    }
    await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(filePath);
        res.body.pipe(fileStream);
        res.body.on('error', (err) => {
          reject(err);
        });
        fileStream.on('finish', function() {
          resolve();
        });
    });
}

/* Helpers */
const getPagePath = (url) => url.replace('http://', '').replace('.html', '').split('/').splice(1, 2).join('/');

const getFilePath = (url, pageData) => {
    var pagePath = getPagePath(url);
    if (!pagePath) {
        return null;
    }
    var parts = pagePath.split('/');
    if (parts.length === 2 && parts[0] === 'news') {
        parts[0] = '_posts';
        parts[1] = pageData.date.split(' ')[0] + '-' + parts[1];
    } else if (parts.length === 2 && parts[0] === 'uploads' || parts[0] === 'images') {
        parts[0] = '.images';
    } else if (parts.length === 0) {
        return null;
    }
    const path = './' + parts.join('/');
    return path.toLowerCase().replace(/%20/gi, '_');
};

const getBaseUrl = (url) => url.split('/').splice(0, 3).join('/');

function getPageFilePath(url, pageData) {
    const filePath = getFilePath(url, pageData);
    if (!filePath) {
        return null;
    }
    return filePath + '.md';
}

const timeout = ms => new Promise(res => setTimeout(res, ms));

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        const xml = await promisify(fs.readFile)('./originsitemap.xml');
        const elements = await promisify(parseString)(xml);
        for (let element of elements.urlset.url) {
            const url = element.loc[0];
            console.log(url);
            await page.goto(url);
            await preparePage(url, page);
            await downloadImages(url, page);
            await compressImages();
            const pageData = await getPageData(url, page);
            const filePath = getPageFilePath(url, pageData);
            if (!filePath) {
                continue;
            }
            const markdown = convertHtmlToMd(pageData);
            if (!markdown) {
                continue;
            }
            console.log(filePath);
            await promisify(fs.writeFile)(filePath, markdown);
            await timeout(5000);
        }
        await browser.close();
    } catch(e) {
        console.log(e);
    }
})();