const imagemin = require('imagemin');
const imageminJpegtran = require('imagemin-jpegtran');
const imageminPngquant = require('imagemin-pngquant');
const {promisify} = require('util');
const fs = require('fs');
const rimraf = require('rimraf');

module.exports = async () => {
    const files = await imagemin(['.images/*.{jpg,png}'], 'assets', {
        plugins: [
            imageminJpegtran({progressive: true}),
            imageminPngquant({quality: '65-80'})
        ]
    });

    console.log(files);
    await promisify(rimraf)('.images');
};