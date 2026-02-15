const express = require('express');
const router = express.Router();
const tripService = require('../services/tripService');
const authMiddleware = require('../middleware/auth');
const { groupAccess } = require('../middleware/groupAccess');
const validate = require('../middleware/validate');
const { createTripSchema, updateTripSchema } = require('../validators/tripValidator');

router.use(authMiddleware);

// List trips in group
router.get('/:groupId/trips', groupAccess, (req, res, next) => {
  try {
    const trips = tripService.getGroupTrips(req.params.groupId);
    res.json({ trips });
  } catch (err) {
    next(err);
  }
});

// Create trip
router.post('/:groupId/trips', groupAccess, validate(createTripSchema), (req, res, next) => {
  try {
    const trip = tripService.createTrip(
      req.params.groupId,
      req.body.name,
      req.body.description,
      req.user.id
    );
    res.status(201).json({ trip });
  } catch (err) {
    next(err);
  }
});

// Get trip
router.get('/:groupId/trips/:tripId', groupAccess, (req, res, next) => {
  try {
    const trip = tripService.getTripById(req.params.tripId);
    res.json({ trip });
  } catch (err) {
    next(err);
  }
});

// Update trip
router.put('/:groupId/trips/:tripId', groupAccess, validate(updateTripSchema), (req, res, next) => {
  try {
    const trip = tripService.updateTrip(req.params.tripId, req.body);
    res.json({ trip });
  } catch (err) {
    next(err);
  }
});

// Delete trip
router.delete('/:groupId/trips/:tripId', groupAccess, (req, res, next) => {
  try {
    tripService.deleteTrip(req.params.tripId, req.user.id);
    res.json({ message: 'Trip deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
