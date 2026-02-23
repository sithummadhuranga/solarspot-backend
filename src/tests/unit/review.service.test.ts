/**
 * Unit tests — ReviewService
 * TODO: Member 2 — implement tests.
 */

describe('ReviewService', () => {
  describe('createReview', () => {
    it.todo('should create review and trigger averageRating recalculation');
    it.todo('should throw 409 if user already reviewed the station');
  });

  describe('updateReview', () => {
    it.todo('should allow author to update');
    it.todo('should throw 403 if not author and not admin');
  });

  describe('deleteReview', () => {
    it.todo('should soft-delete review');
  });

  describe('toggleLike', () => {
    it.todo('should add like if not liked');
    it.todo('should remove like if already liked');
  });

  describe('moderateReview', () => {
    it.todo('should set moderationStatus to approved or rejected');
    it.todo('should record moderatedBy and moderatedAt');
  });
});
