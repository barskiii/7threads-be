const Twit = require('twit');
const mongoose = require('mongoose');
const express = require('express');
require('dotenv').config()

const app = express();

const twitter = new Twit({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token: process.env.ACCESS_KEY,
  access_token_secret: process.env.ACCESS_SECRET,
});

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(error => console.error('Error connecting to MongoDB:', error));

const tweetSchema = new mongoose.Schema({
  status: { type: Object, required: true },
  created_at: { type: Date, required: true },
  favorite_count: { type: Number },
  retweet_count: { type: Number }
});

const Tweet = mongoose.model('Tweet', tweetSchema);

async function getPopularTweets(query) {
  const params = {
    q: query,
    result_type: 'mixed',
    count: 100
  };

  try {
    const { data } = await twitter.get('search/tweets', params);
    // console.log(data)
    const { statuses } = data;
    const tweets = statuses.map(status => ({ 
      status, 
      created_at: new Date(status.created_at), 
      favorite_count: status.favorite_count, 
      retweet_count: status.retweet_count 
    }));
    return tweets;
  } catch (error) {
    console.error(`Error fetching popular tweets for query "${query}":`, error);
    throw error;
  }
}

async function savePopularTweets(query) {
  const tweets = await getPopularTweets(query);
  const updateTweetDocuments = [];
  const newTweetDocuments = [];
  
  for (const tweet of tweets) {
    const existingTweet = await Tweet.findOne({ 'status.id_str': tweet.status.id_str });
    if (existingTweet) {
      existingTweet.set({
        status: tweet.status,
        created_at: new Date(tweet.status.created_at),
        favorite_count: tweet.status.favorite_count,
        retweet_count: tweet.status.retweet_count,
      });
      updateTweetDocuments.push(existingTweet);
    } else {
      const tweetDocument = new Tweet({
        status: tweet.status,
        created_at: new Date(tweet.status.created_at),
        favorite_count: tweet.status.favorite_count,
        retweet_count: tweet.status.retweet_count,
      });
      newTweetDocuments.push(tweetDocument);
    }
  }

  let numNewTweets = 0;
  let numUpdatedTweets = 0;

  if (newTweetDocuments.length > 0) {
    try {
      const savedTweets = await Tweet.insertMany(newTweetDocuments);
      numNewTweets = savedTweets.length;
      console.log(`${numNewTweets} new popular tweets saved to MongoDB`);
    } catch (error) {
      console.error('Error saving new popular tweets to MongoDB:', error);
      throw error;
    }
  }

  if (updateTweetDocuments.length > 0) {
    try {
      const updatedTweets = await Promise.all(updateTweetDocuments.map(tweet => tweet.save()));
      numUpdatedTweets = updatedTweets.length;
      console.log(`${numUpdatedTweets} existing popular tweets updated with latest data`);
    } catch (error) {
      console.error('Error updating popular tweets with latest data:', error);
      throw error;
    }
  }

  if (numNewTweets === 0 && numUpdatedTweets === 0) {
    console.log('No new or updated popular tweets to save');
  }
}

savePopularTweets('ai 🧵 -filter:retweets')
    .then(() => console.log('Popular tweets saved to MongoDB'))
    .catch(error => console.error('Error saving popular tweets to MongoDB:', error));

setInterval(() => {
  savePopularTweets('ai 🧵 -filter:retweets')
    .then(() => console.log('Popular tweets saved to MongoDB'))
    .catch(error => console.error('Error saving popular tweets to MongoDB:', error));
}, 4 * 60 * 60 * 1000); // 6 hours

app.get('/most-popular-7-hours', async (req, res) => {
  const now = new Date();
  const sevenHoursAgo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
  const tweets = await Tweet.find({ created_at: { $gte: sevenHoursAgo } }).sort({ favorite_count: -1, retweet_count: -1 }).limit(7);
  res.json(tweets);
});

app.get('/most-popular-7-days', async (req, res) => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const tweets = await Tweet.find({ created_at: { $gte: sevenDaysAgo } }).sort({ favorite_count: -1, retweet_count: -1 }).limit(7);
  res.json(tweets);
});

app.get('/most-popular-7-weeks', async (req, res) => {
  const now = new Date();
  const sevenWeeksAgo = new Date(now.getTime() - 7 * 7 * 24 * 60 * 60 * 1000);
  const tweets = await Tweet.find({ created_at: { $gte: sevenWeeksAgo } }).sort({ favorite_count: -1, retweet_count: -1 }).limit(7);
  res.json(tweets);
});

const port = process.env.PORT || 3000;
app.listen(port, "127.0.0.1", () => console.log(`Server listening on port ${port}`));
