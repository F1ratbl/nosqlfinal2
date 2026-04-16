// Unique constraints for Person
CREATE CONSTRAINT person_username_unique IF NOT EXISTS FOR (p:Person) REQUIRE p.username IS UNIQUE;

// Unique constraints for Post
CREATE CONSTRAINT post_id_unique IF NOT EXISTS FOR (p:Post) REQUIRE p.post_id IS UNIQUE;

// Unique constraints for Message
CREATE CONSTRAINT message_id_unique IF NOT EXISTS FOR (m:Message) REQUIRE m.message_id IS UNIQUE;

// Unique constraints for Comment
CREATE CONSTRAINT comment_id_unique IF NOT EXISTS FOR (c:Comment) REQUIRE c.comment_id IS UNIQUE;
