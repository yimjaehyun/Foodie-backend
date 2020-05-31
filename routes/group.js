const express = require('express');
const router = express.Router();

// Group Model
const Group = require("../models/Group.js");
const User = require("../models/User.js");

router.post('/create', async (req, res) => {
	const {name, users, admins, location, radius} = req.body || {}
	if (!name || !users || !admins) {
		return res.status(400).json({msg: "Missing group name or list of users"})
	}

    console.log(radius)

	if (admins.length == 0) {
		return res.status(400).json({msg: "Must appoint an admin"})
	}

    // initialize offsets for each user to start at 0
    var offsets = {}
    users.forEach(user => {
        offsets[user] = 0
    });

	var newGroup = Group({
		name,
		users,
        admins,
        offsets
	})

	if (location && radius) {
		newGroup.location = location
		newGroup.radius = radius
	}

	let group = await newGroup.save()


    // Update User's current groups
    for (let i = 0; i < users.length; i++) {
        User.findByIdAndUpdate(users[i], { "$push": { "groups": group.id }, "$set": { "currentGroup": group }},
            (err, raw) => {
                if (err) throw err;
            }
        );
    }

    await group.populate({
            path: 'users', 
            select: '-groups -password -currentGroup',
            populate: { 
                path: 'friends',
                select: '-groups -friends -password -currentGroup'}
        }).execPopulate()

	return res.status(200).json({group: group, msg: "New Group created"});
})

router.post('/remove', (req, res) => {
	const {groupId} = req.body || {}
	if (!groupId) {
		return res.status(400).json({msg: "Missing group"})
	}

	Group.findById(groupId).then(group => {
		if(!group) return res.status(400).json({msg: "No group by the id: " + groupId})
		users = User.find({groups: groupId})

		User.updateMany(users, {"$pull": {"groups": groupId}}, (err, raw) => {
			if (err) throw err
		})
	})

	Group.findByIdAndDelete(groupI, (err, raw) => {
		if (err) throw err;
	})
	return res.status(200).json({msg: "Group Removed"})

})

router.post('/user/add', (req, res) => {
	const {groupId, userId} = req.body || {}
	if (!groupId || !userId) {
		return res.status(400).json({msg: "Missing fields"});
	}

	Group.findById(groupId).then(group => {
		if(!group) return res.status(400).json({msg: "No group by the id: " + groupId})

		if(group.users.includes(userId)) {
			return res.status(400).json({msg: "User already in the group"})
		}

		group.updateOne({ "$push": {"users": userId } }, {new: true}, (err, raw) => {
			if (err) throw err;
		})

		User.findByIdAndUpdate(userId, { "$push": {"groups": groupId } }, {new: true},
			(err, raw) => {
				if (err) throw err;
			}
		);

		return res.status(200).json({msg: "User added"});
	})
})

router.post('/user/remove', (req, res) => {
	const {groupId, userId} = req.body || {}
	if (!groupId || !userId) {
		return res.status(400).json({msg: "Missing fields"});
	}

	Group.findById(groupId).then(group => {
		if(!group) return res.status(400).json({msg: "No group by the id: " + groupId})

		if(group.users.includes(userId)) {
			group.updateOne({ "$pull": {"users": userId} }, {new: true}, (err, raw) => {
				if (err) throw err;
			})

			User.findByIdAndUpdate(userId, { "$pull": {"groups": groupId} }, {new: true},(err, raw) => {
					if (err) throw err;
				}
			);
		}
		else {
			return res.status(400).json({msg: "User is not in this group!"})
		}
		return res.status(200).json({msg: "User Removed"})
	})
})

router.get('/id/:id', (req, res) => {
	const id = req.params.id;
	Group.findById(id).then(group => {
		if(!group) return res.status(400).json({msg: "No group by the id: " + id})

		res.status(200).json(group);
	})
})

router.post('/offset', async (req, res) => {
	var {userId, groupId, offset} = req.body || {}

    if(!userId || !groupId || offset == null ) {
        return res.status(400).json({"errors": ["Missing userId, groupId, or offset in the body"] })
    }

    let group = await Group.findById( groupId );

    if (!group) return res.status(400).json({msg: "No group by the id: " + id});

    group.offsets.set(userId, offset);
    group.markModified('offsets');
    group.save();

    return res.status(200).json({offset: group.offsets});
});

module.exports = router;

