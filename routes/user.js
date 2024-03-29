const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

// User Model
const User = require("../models/User.js");

router.post('/register', (req, res) => {
	let errors = []
	var {userName, firstName, lastName, email, password, password2} = req.body || {}

	if (!userName || !firstName || !lastName  || !email || !password || !password2) {
		return res.status(400).json({errors: ["Please enter all fields"]});
	}

	if (email.indexOf("@") == -1 || email.slice(-4) != ".com") {
		errors.push("Incorrect email address")
	}

	if (password !== password2) {
		errors.push("Passwords do not match");
	}

	if (password.length < 6) {
		errors.push("Password should be at least 6 characters");
	}

	if (errors.length > 0) {
		return res.status(400).json({errors: errors});
	}

	// Check for exisiting user
    email =  email.toLowerCase()
	User.findOne({ email }).then(user => {
		var errors = []

		if (user) {
			errors.push("Email already registered.");
		}
        
        userName = userName.toLowerCase()
		User.findOne({ userName }).then(user2 => {
			if (user2) {
				errors.push("userName already taken.");
			}

			if (errors.length != 0) {
				return res.status(400).json({"errors": errors})
			}

			const newUser = User({
				userName,
				firstName,
				lastName,
				email,
				password,
				friends: [],
				groups: []
			})

			bcrypt.genSalt(10, (err, salt) => {
			    bcrypt.hash(newUser.password, salt, (err, hash) => {
				if (err) throw err;
				newUser.password = hash;
				        newUser.save().then(user => {
					        return res.status(201).json({msg: 'Registered', userId: user.id});
				        })
					.catch(err => console.log(err));
			    });
			});
		})

	})
})

router.post('/remove', (req, res) => {
	const {userId} = req.body || {}

	if (!userId) { return res.status(201).json({msg: "Missing fields"})}

	User.findById(userId).then(user => {
		if(!user) return res.status(400).json({msg: "No user by the id: " + userId})
		
		user.updateOne({ "$set": {isDeleted: true}}, {new: true}, (err, raw) => {
			if (err) throw err
			return res.status(200).json({msg: "User deleted"})
		})
	})
})

router.post('/friend/add', (req, res) => {
	const {userId, friendId} = req.body || {}

	if (!userId || !friendId) {
		return res.status(201).json({msg: "Missing fields"})
	}

	User.findById(userId).then(user => {
		if(!user) return res.status(400).json({msg: "No user by the id: " + userId})

		if (user.friends.includes(friendId)) {
			return res.status(400).json({msg: "User is already a friend"})
		}
		else {
			user.updateOne({ "$push": {"friends": friendId } }, {new: true},
			(err, raw) => {
				if (err) return res.status(400).json({msg: err});
			});	

			User.findByIdAndUpdate(friendId, { "$push": {"friends": userId } }, {new: true},
				(err, raw) => {
					if (err) return res.status(400).json({msg: err});
				});	
		}
		return res.status(200).json({msg: 'Added a friend!'})
	})
})

router.post('/friend/remove', (req, res) => {
	const {userId, friendId} = req.body || {}

	if (!userId || !friendId) {
		return res.status(201).json({msg: "Missing fields"})
	}

	User.findById(userId).then(user => {
		if(!user) return res.status(400).json({msg: "No user by the id: " + userId})

		if (!user.friends.includes(friendId)) {
			return res.status(400).json({msg: "Friend does not exist"})
		}
		else {
			user.updateOne({ "$pull": {"friends": friendId } }, {new: true},
			(err, raw) => {
				if (err) throw err;
			}
		);	

			User.findByIdAndUpdate(friendId, { "$pull": {"friends": userId } }, {new: true},
				(err, raw) => {
					if (err) throw err;
				}
			);	
		}

		return res.status(200).json({msg: 'Removed a friend'})
	})
})

router.post('/login', (req, res) => {
    console.log("login")
	var {userName, email, password} = req.body || {}

	if((!email && !userName) || !password) {
		return res.status(400).json({errors: ["Missing fields"]})
	}

	var searchBy = email.toLowerCase() || userName.toLowerCase()

	User.findOne({$or: [{'email': searchBy}, {'userName': searchBy}]}).then(user => {
		if(!user) return res.status(400).json({errors: ["Incorrect credentials"]})

		bcrypt.compare(req.body.password, user.password, (err, isMatch) => {
			if(err) throw err;

			if(isMatch) return res.status(200).json({userId: user.id})

			return res.status(400).json({errors: ["Incorrect credentials"]})
		})
	});
})

router.get('/id/:id', (req, res) => {
	const id = req.params.id
	User.findById(id)
		.populate({
			path: 'friends', 
            select: '-groups -password -currentGroup',
			populate: { 
				path: 'friends',
				select: '-groups -friends -password -currentGroup'}
        })
		.populate({
		 	path: 'groups',
			populate: { 
				path: 'users',
				select: '-groups -friends -password -currentGroup'}
		 })
		.populate({
		 	path: 'currentGroup',
			populate: { 
				path: 'users',
				select: '-groups -friends -password -currentGroup'}
		 })
		.select('-password')
		.then(user => {
		if(!user) return res.status(400).json({msg: "No user by the id: " + id});

		res.status(200).json(user);
	})
})

router.get('/search', async (req, res) => {
	const searchText = req.query.searchText
	if (!searchText) return res.status(400).json({'errors': 'Missing parameter'})

	var foundUsers = await User.aggregate([
		{$project: {
			newField:{$concat:["$firstName", " ", "$lastName", " ", "$userName"]},
			firstName: "$firstName",
			lastName: "$lastName",
			userName: "$userName",
			email: "$email",
			friends: "$friends"
		}},
        {$match:{newField:new RegExp(searchText, 'i')}}
	]);

    foundUsers = await User.populate(foundUsers, 
        { 
            path: 'friends', 
            select: '-groups -friends -password -currentGroup'
        });

	return res.status(200).json(foundUsers)
})

module.exports = router;
