import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PrivateRoute = () => {
    const { user, loading } = useAuth();

    // console.log('PrivateRoute user:', user);

    if (loading) {
        return <div>Loading...</div>;
    }

    // console.log('PrivateRoute user:', user);
    // console.log('PrivateRoute loading:', loading);


    return user ? <Outlet /> : <Navigate to="/login" />;
};

export default PrivateRoute;
