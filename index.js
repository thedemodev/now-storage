const crypto = require('crypto');
const fetch = require('node-fetch');
const retry = require('async-retry');

let defaultConfig = {
  deploymentName: 'uploaded-file',
  retry: {
    retries: 3,
  },
};

async function upload(token, file, config = defaultConfig) {
  // validate token
  if (!token) {
    throw new ReferenceError('You must provide a Now token.');
  }
  if (typeof token !== 'string') {
    throw new TypeError('The Now token provided must be a string.');
  }

  // validate file
  if (!file) {
    throw new ReferenceError('You must provide a file object.');
  }
  if (typeof file !== 'object') {
    throw new TypeError('The file provided must be an object.')
  }
  // validate file.name
  if (!file.name) {
    throw new ReferenceError('The file object must have a name.');
  }
  if (typeof file.name !== 'string') {
    throw new TypeError('The file name must be a string.');
  }
  // validate file.content
  if (!file.content) {
    throw new ReferenceError('The file object must have a content.');
  }

  // create hash algorithm
  const shasum = crypto.createHash('sha1');
  shasum.update(file.content);
  const sha = shasum.digest('hex');

  try {
    await retry(async () => {
      const response = await fetch('https://api.zeit.co/v2/now/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': file.content.length,
          'x-now-digest': sha,
          'x-now-size': file.content.length
        },
        body: file.content
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error.message);
      }
    }, { ...defaultConfig.retry, ...config.retry });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(error);
    }
    throw new Error('An error happened while uploading the file.');
  }

  try {
    return await retry(async () => {
      const response = await fetch('https://api.zeit.co/v2/now/deployments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: config.deploymentName,
          deploymentType: 'static',
          files: [{ file: file.name, sha, mode: 33206 }]
        })
      })

      const body = await response.json();

      if (!response.ok) throw new Error(body.error.message);

      return body;
    }, { ...defaultConfig.retry, ...config.retry });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(error);
    }
    throw new Error('There was an error while deploying.');
  }
}

module.exports = { upload };