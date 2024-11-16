import { Request, Response } from 'express';
import { User } from '../models/User';
import { updateUser } from '../services/userService';

export const getProfile = (req: Request, res: Response) => {
    const user = req.user as User;
    res.json({ user: { id: user.id, email: user.email, username: user.username } });
};

export const updateProfile = async (req: Request, res: Response) => {
    try {
        const user = req.user as User;
        const { username } = req.body;
        const updatedUser = await updateUser(user.id, { username });
        res.json({ user: { id: updatedUser.id, email: updatedUser.email } });
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile' });
    }
};