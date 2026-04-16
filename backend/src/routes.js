const express = require('express');
const crypto = require('crypto');
const { getDriver } = require('./db');

const router = express.Router();

// ─── POST /register ─────────────────────────────────────────────────────────
// Creates a Person node. Returns 409 if username already exists.
router.post('/register', async (req, res) => {
  const { username, display_name } = req.body;

  if (!username || !display_name) {
    return res.status(400).json({ error: 'username and display_name are required' });
  }

  const session = getDriver().session();
  try {
    // Check if user already exists
    const existing = await session.run(
      'MATCH (p:Person {username: $username}) RETURN p',
      { username }
    );

    if (existing.records.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Create the user
    const result = await session.run(
      `CREATE (p:Person {
        username: $username,
        display_name: $display_name,
        created_at: datetime()
      }) RETURN p`,
      { username, display_name }
    );

    const person = result.records[0].get('p').properties;
    res.status(201).json({ message: 'User registered successfully', user: person });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /users/:username ───────────────────────────────────────────────────
// Returns the profile details of a user.
router.get('/users/:username', async (req, res) => {
  const { username } = req.params;

  const session = getDriver().session();
  try {
    const result = await session.run(
      'MATCH (p:Person {username: $username}) RETURN p',
      { username }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const person = result.records[0].get('p').properties;
    res.status(200).json({ user: person });
  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── POST /friend-request ──────────────────────────────────────────────────
// Creates a FRIEND_REQUEST relationship from one user to another.
router.post('/friend-request', async (req, res) => {
  const { from, to } = req.body;

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to usernames are required' });
  }

  if (from === to) {
    return res.status(400).json({ error: 'Cannot send friend request to yourself' });
  }

  const session = getDriver().session();
  try {
    // Verify both users exist
    const users = await session.run(
      `MATCH (a:Person {username: $from}), (b:Person {username: $to})
       RETURN a, b`,
      { from, to }
    );

    if (users.records.length === 0) {
      return res.status(404).json({ error: 'One or both users not found' });
    }

    // Check if they are already friends
    const alreadyFriends = await session.run(
      `MATCH (a:Person {username: $from})-[:FRIEND]-(b:Person {username: $to})
       RETURN a`,
      { from, to }
    );

    if (alreadyFriends.records.length > 0) {
      return res.status(409).json({ error: 'Users are already friends' });
    }

    // Check if a request already exists
    const existingRequest = await session.run(
      `MATCH (a:Person {username: $from})-[:FRIEND_REQUEST]->(b:Person {username: $to})
       RETURN a`,
      { from, to }
    );

    if (existingRequest.records.length > 0) {
      return res.status(409).json({ error: 'Friend request already sent' });
    }

    // Create the friend request
    await session.run(
      `MATCH (a:Person {username: $from}), (b:Person {username: $to})
       CREATE (a)-[:FRIEND_REQUEST {created_at: datetime()}]->(b)`,
      { from, to }
    );

    res.status(201).json({ message: `Friend request sent from ${from} to ${to}` });
  } catch (error) {
    console.error('Friend request error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── POST /friend-accept ───────────────────────────────────────────────────
// Accepts a friend request: deletes FRIEND_REQUEST, creates bidirectional FRIEND.
router.post('/friend-accept', async (req, res) => {
  const { from, to } = req.body;

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to usernames are required' });
  }

  const session = getDriver().session();
  try {
    // Verify the friend request exists (from -> to)
    const request = await session.run(
      `MATCH (a:Person {username: $from})-[r:FRIEND_REQUEST]->(b:Person {username: $to})
       RETURN r`,
      { from, to }
    );

    if (request.records.length === 0) {
      return res.status(404).json({ error: 'No pending friend request found' });
    }

    // Delete request and create bidirectional FRIEND relationships
    await session.run(
      `MATCH (a:Person {username: $from})-[r:FRIEND_REQUEST]->(b:Person {username: $to})
       DELETE r
       CREATE (a)-[:FRIEND {since: datetime()}]->(b)
       CREATE (b)-[:FRIEND {since: datetime()}]->(a)`,
      { from, to }
    );

    res.status(200).json({ message: `${from} and ${to} are now friends` });
  } catch (error) {
    console.error('Friend accept error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── POST /friend-reject ───────────────────────────────────────────────────
// Rejects a friend request: deletes FRIEND_REQUEST.
router.post('/friend-reject', async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to usernames required' });

  const session = getDriver().session();
  try {
    await session.run(
      `MATCH (a:Person {username: $from})-[r:FRIEND_REQUEST]->(b:Person {username: $to})
       DELETE r`,
      { from, to }
    );
    res.status(200).json({ message: 'Friend request rejected' });
  } catch (error) {
    console.error('Friend reject error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── POST /friend-remove ───────────────────────────────────────────────────
// Unfriend: deletes FRIEND relationship in both directions.
router.post('/friend-remove', async (req, res) => {
  const { user1, user2 } = req.body;
  if (!user1 || !user2) return res.status(400).json({ error: 'user1 and user2 required' });

  const session = getDriver().session();
  try {
    await session.run(
      `MATCH (a:Person {username: $user1})-[r:FRIEND]-(b:Person {username: $user2})
       DELETE r`,
      { user1, user2 }
    );
    res.status(200).json({ message: 'Unfriended successfully' });
  } catch (error) {
    console.error('Friend remove error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /users/:username/friends ───────────────────────────────────────────
// Returns a list of direct friends for the user.
router.get('/users/:username/friends', async (req, res) => {
  const { username } = req.params;

  const session = getDriver().session();
  try {
    // Verify user exists
    const userCheck = await session.run(
      'MATCH (p:Person {username: $username}) RETURN p',
      { username }
    );

    if (userCheck.records.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all friends (directionless match since we store both directions)
    const result = await session.run(
      `MATCH (p:Person {username: $username})-[:FRIEND]->(friend:Person)
       RETURN friend`,
      { username }
    );

    const friends = result.records.map((record) => record.get('friend').properties);
    res.status(200).json({ username, friends, count: friends.length });
  } catch (error) {
    console.error('Get friends error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /users/:username/friend-requests ──────────────────────────────────
// Returns users who sent a friend request to this user
router.get('/users/:username/friend-requests', async (req, res) => {
  const { username } = req.params;
  const session = getDriver().session();
  try {
    const result = await session.run(
      `MATCH (sender:Person)-[:FRIEND_REQUEST]->(receiver:Person {username: $username})
       RETURN sender
       ORDER BY sender.username ASC`,
      { username }
    );
    const requests = result.records.map((record) => record.get('sender').properties);
    res.status(200).json({ username, requests, count: requests.length });
  } catch (error) {
    console.error('Get requests error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /users/:username/relationship/:other ──────────────────────────────
// Returns relation state: none, friend, request_sent, request_received
router.get('/users/:username/relationship/:other', async (req, res) => {
  const { username, other } = req.params;
  const session = getDriver().session();
  try {
    const result = await session.run(
      `
      MATCH (u:Person {username: $username}), (o:Person {username: $other})
      OPTIONAL MATCH (u)-[fr:FRIEND]-(o)
      OPTIONAL MATCH (u)-[req_sent:FRIEND_REQUEST]->(o)
      OPTIONAL MATCH (o)-[req_rec:FRIEND_REQUEST]->(u)
      RETURN
        CASE
          WHEN fr IS NOT NULL THEN 'friend'
          WHEN req_sent IS NOT NULL THEN 'request_sent'
          WHEN req_rec IS NOT NULL THEN 'request_received'
          ELSE 'none'
        END AS status
      `,
      { username, other }
    );
    if(result.records.length === 0) return res.status(404).json({ error: 'Users not found' });
    res.status(200).json({ status: result.records[0].get('status') });
  } catch (error) {
    console.error('Relationship error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── POST /posts ───────────────────────────────────────────────────────────
// Creates a Post with random UUID and specified visibility
router.post('/posts', async (req, res) => {
  const { username, content, visibility } = req.body;
  const validVisibility = ['public', 'friends', 'friends_of_friends', 'private'];
  
  if (!username || !content || !visibility) {
    return res.status(400).json({ error: 'username, content, and visibility are required' });
  }

  if (!validVisibility.includes(visibility)) {
    return res.status(400).json({ error: 'Invalid visibility' });
  }

  const post_id = crypto.randomUUID();
  const session = getDriver().session();

  try {
    const result = await session.run(
      `MATCH (u:Person {username: $username})
       CREATE (u)-[:POSTED]->(p:Post {
         post_id: $post_id,
         content: $content,
         visibility: $visibility,
         created_at: datetime()
       })
       RETURN p`,
      { username, post_id, content, visibility }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const post = result.records[0].get('p').properties;
    res.status(201).json({ message: 'Post created', post });
  } catch (error) {
    console.error('Create post error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── POST /posts/:post_id/like ─────────────────────────────────────────────
// Like a post (creates a LIKED relationship)
router.post('/posts/:post_id/like', async (req, res) => {
  const { post_id } = req.params;
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'username is required' });
  }

  const session = getDriver().session();
  try {
    const checkLike = await session.run(
      `MATCH (u:Person {username: $username})-[r:LIKED]->(p:Post {post_id: $post_id}) RETURN r`,
      { username, post_id }
    );

    if (checkLike.records.length > 0) {
      await session.run(
        `MATCH (u:Person {username: $username})-[r:LIKED]->(p:Post {post_id: $post_id}) DELETE r`,
        { username, post_id }
      );
      return res.status(200).json({ message: 'Post unliked', action: 'unliked' });
    } else {
      const result = await session.run(
        `MATCH (u:Person {username: $username}), (p:Post {post_id: $post_id})
         CREATE (u)-[r:LIKED {created_at: datetime()}]->(p) RETURN p`,
        { username, post_id }
      );
      if (result.records.length === 0) return res.status(404).json({ error: 'User or Post not found' });
      return res.status(200).json({ message: 'Post liked', action: 'liked' });
    }
  } catch (error) {
    console.error('Like post error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── POST /posts/:post_id/comments ─────────────────────────────────────────
// Add a comment to a post
router.post('/posts/:post_id/comments', async (req, res) => {
  const { post_id } = req.params;
  const { username, content } = req.body;
  if (!username || !content) return res.status(400).json({ error: 'username and content required' });

  const comment_id = crypto.randomUUID();
  const session = getDriver().session();
  try {
    const result = await session.run(
      `MATCH (u:Person {username: $username}), (p:Post {post_id: $post_id})
       CREATE (u)-[:WROTE]->(c:Comment {
         comment_id: $comment_id,
         content: $content,
         created_at: datetime()
       })-[:ON_POST]->(p)
       RETURN c`,
      { username, post_id, comment_id, content }
    );
    if (result.records.length === 0) return res.status(404).json({ error: 'User or Post not found' });
    res.status(201).json({ message: 'Comment added', comment: result.records[0].get('c').properties });
  } catch (error) {
    console.error('Comment error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /users/:username/posts ─────────────────────────────────────────────
// Get all posts authored by a user
router.get('/users/:username/posts', async (req, res) => {
  const { username } = req.params;
  const viewer = req.query.viewer || ''; // optional for "is_liked_by_me"

  const session = getDriver().session();
  try {
    const result = await session.run(
      `MATCH (author:Person {username: $username})-[:POSTED]->(p:Post)
       OPTIONAL MATCH (p)<-[:LIKED]-(liker:Person)
       WITH p, author, count(liker) AS like_count, sum(CASE WHEN liker.username = $viewer THEN 1 ELSE 0 END) > 0 AS is_liked_by_me
       
       OPTIONAL MATCH (p)<-[:ON_POST]-(c:Comment)<-[:WROTE]-(commenter:Person)
       WITH p, author, like_count, is_liked_by_me, c, commenter ORDER BY c.created_at ASC
       WITH p, author, like_count, is_liked_by_me, collect(CASE WHEN c IS NOT NULL THEN { id: c.comment_id, content: c.content, author: commenter.username, display_name: commenter.display_name, time: toString(c.created_at) } ELSE null END) AS raw_comments
       
       RETURN p, author.username AS author, author.display_name AS display_name, like_count, is_liked_by_me, [x IN raw_comments WHERE x IS NOT NULL] AS comments
       ORDER BY p.created_at DESC`,
      { username, viewer }
    );

    const posts = result.records.map((record) => {
      const p = record.get('p').properties;
      return {
        ...p,
        like_count: record.get('like_count').toNumber(),
        is_liked_by_me: record.get('is_liked_by_me'),
        comments: record.get('comments')
      };
    });
    res.status(200).json({ username, posts, count: posts.length });
  } catch (error) {
    console.error('Get user posts error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /feed/:username ───────────────────────────────────────────────────
// Returns feed of posts based on privacy/visibility rules
router.get('/feed/:username', async (req, res) => {
  const { username } = req.params;

  const session = getDriver().session();
  try {
    const query = `
      MATCH (u:Person {username: $username})
      MATCH (author:Person)-[:POSTED]->(post:Post)
      WHERE author = u 
         OR post.visibility = 'public' 
         OR (post.visibility = 'friends' AND EXISTS { MATCH (u)-[:FRIEND]-(author) }) 
         OR (post.visibility = 'friends_of_friends' AND EXISTS { MATCH (u)-[:FRIEND*1..2]-(author) })
      
      OPTIONAL MATCH (post)<-[:LIKED]-(liker:Person)
      WITH post, author, u, count(liker) AS like_count, sum(CASE WHEN liker = u THEN 1 ELSE 0 END) > 0 AS is_liked_by_me
      
      OPTIONAL MATCH (post)<-[:ON_POST]-(c:Comment)<-[:WROTE]-(commenter:Person)
      WITH post, author, like_count, is_liked_by_me, c, commenter ORDER BY c.created_at ASC
      WITH post, author, like_count, is_liked_by_me, collect(CASE WHEN c IS NOT NULL THEN { id: c.comment_id, content: c.content, author: commenter.username, display_name: commenter.display_name, time: toString(c.created_at) } ELSE null END) AS raw_comments
      
      RETURN post, author.username AS author, author.display_name AS display_name, like_count, is_liked_by_me, [x IN raw_comments WHERE x IS NOT NULL] AS comments
      ORDER BY post.created_at DESC
      LIMIT 100
    `;
    
    const result = await session.run(query, { username });

    const feed = result.records.map((record) => {
      return {
        ...record.get('post').properties,
        author: record.get('author'),
        author_display_name: record.get('display_name'),
        like_count: record.get('like_count').toNumber(),
        is_liked_by_me: record.get('is_liked_by_me'),
        comments: record.get('comments')
      };
    });

    res.status(200).json({ feed, count: feed.length });
  } catch (error) {
    console.error('Get feed error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /users/:username/friends-of-friends ───────────────────────────────
// Users 2 hops away, not direct friends, not self
router.get('/users/:username/friends-of-friends', async (req, res) => {
  const { username } = req.params;

  const session = getDriver().session();
  try {
    const result = await session.run(
      `MATCH (u:Person {username: $username})-[:FRIEND*2]-(fof:Person)
       WHERE u <> fof AND NOT (u)-[:FRIEND]-(fof)
       RETURN DISTINCT fof`,
      { username }
    );

    const fofs = result.records.map((record) => record.get('fof').properties);
    res.status(200).json({ username, friends_of_friends: fofs, count: fofs.length });
  } catch (error) {
    console.error('Get FOF error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /users/:username/mutual-friends/:other ────────────────────────────
// Mutual friends between two users
router.get('/users/:username/mutual-friends/:other', async (req, res) => {
  const { username, other } = req.params;

  const session = getDriver().session();
  try {
    const result = await session.run(
      `MATCH (u:Person {username: $username})-[:FRIEND]-(mutual:Person)-[:FRIEND]-(o:Person {username: $other})
       RETURN mutual`,
      { username, other }
    );

    const mutuals = result.records.map((record) => record.get('mutual').properties);
    res.status(200).json({ username, other, mutual_friends: mutuals, count: mutuals.length });
  } catch (error) {
    console.error('Get mutual friends error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /users/:username/suggestions ──────────────────────────────────────
// Suggest friends by counting mutual connections
router.get('/users/:username/suggestions', async (req, res) => {
  const { username } = req.params;

  const session = getDriver().session();
  try {
    const result = await session.run(
      `MATCH (u:Person {username: $username})-[:FRIEND]-(mutual:Person)-[:FRIEND]-(fof:Person)
       WHERE u <> fof AND NOT (u)-[:FRIEND]-(fof)
       WITH fof, count(mutual) as mutual_count
       ORDER BY mutual_count DESC
       RETURN fof, mutual_count`,
      { username }
    );

    const suggestions = result.records.map((record) => ({
      user: record.get('fof').properties,
      mutual_count: record.get('mutual_count').toNumber()
    }));

    res.status(200).json({ username, suggestions, count: suggestions.length });
  } catch (error) {
    console.error('Get suggestions error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── POST /messages ────────────────────────────────────────────────────────
// Send a message. Auth: must be friend or friend-of-friend
router.post('/messages', async (req, res) => {
  const { from, to, content } = req.body;

  if (!from || !to || !content) {
    return res.status(400).json({ error: 'from, to, and content are required' });
  }

  const session = getDriver().session();
  try {
    // 1. Check if users exist and if they are allowed to message (1 or 2 hops difference max)
    const checkAuth = await session.run(
      `MATCH (sender:Person {username: $from}), (receiver:Person {username: $to})
       RETURN EXISTS { MATCH (sender)-[:FRIEND*1..2]-(receiver) } AS is_allowed`,
      { from, to }
    );

    if (checkAuth.records.length === 0) {
      return res.status(404).json({ error: 'Sender or receiver not found' });
    }

    const isAllowed = checkAuth.records[0].get('is_allowed');
    if (!isAllowed) {
      return res.status(403).json({ error: 'Forbidden. You must be friends or friends-of-friends to send a message.' });
    }

    // 2. Create the message mapping sender to message to receiver
    const message_id = crypto.randomUUID();
    const result = await session.run(
      `MATCH (sender:Person {username: $from}), (receiver:Person {username: $to})
       CREATE (sender)-[:SENT]->(m:Message {
         message_id: $message_id,
         content: $content,
         created_at: datetime()
       })-[:TO]->(receiver)
       RETURN m`,
      { from, to, message_id, content }
    );

    const message = result.records[0].get('m').properties;
    res.status(201).json({ message: 'Message sent successfully', data: message });
  } catch (error) {
    console.error('Send message error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

// ─── GET /messages/:username ───────────────────────────────────────────────
// Get all messages sent to this user
router.get('/messages/:username', async (req, res) => {
  const { username } = req.params;

  const session = getDriver().session();
  try {
    const result = await session.run(
      `MATCH (sender:Person)-[:SENT]->(m:Message)-[:TO]->(receiver:Person {username: $username})
       RETURN m, sender.username AS from
       ORDER BY m.created_at DESC`,
      { username }
    );

    const messages = result.records.map((record) => ({
      ...record.get('m').properties,
      from: record.get('from')
    }));

    res.status(200).json({ username, messages, count: messages.length });
  } catch (error) {
    console.error('Get messages error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    await session.close();
  }
});

module.exports = router;
