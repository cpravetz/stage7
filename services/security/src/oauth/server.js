/**
 * OAuth 2.0 server implementation
 */

const OAuth2Server = require('oauth2-server');
const model = require('./model');

// Create OAuth 2.0 server
const oauth = new OAuth2Server({
    model,
    accessTokenLifetime: 60 * 60, // 1 hour
    refreshTokenLifetime: 60 * 60 * 24, // 24 hours
    allowBearerTokensInQueryString: true,
    allowExtendedTokenAttributes: true
});

/**
 * Authenticate middleware
 */
function authenticate(options = {}) {
    return async (req, res, next) => {
        try {
            const request = new OAuth2Server.Request(req);
            const response = new OAuth2Server.Response(res);
            
            // Authenticate the request
            const token = await oauth.authenticate(request, response, options);
            
            // Add token to request
            req.oauth = { token };
            
            next();
        } catch (error) {
            console.error('Authentication error:', error);
            
            // Handle OAuth errors
            if (error instanceof OAuth2Server.OAuthError) {
                res.status(error.code || 500).json({
                    error: error.name,
                    error_description: error.message
                });
            } else {
                res.status(500).json({
                    error: 'server_error',
                    error_description: 'Internal server error'
                });
            }
        }
    };
}

/**
 * Token middleware
 */
function token() {
    return async (req, res, next) => {
        try {
            const request = new OAuth2Server.Request(req);
            const response = new OAuth2Server.Response(res);
            
            // Issue token
            const token = await oauth.token(request, response);
            
            // Send response
            res.set(response.headers);
            res.status(response.status || 200).json(response.body);
        } catch (error) {
            console.error('Token error:', error);
            
            // Handle OAuth errors
            if (error instanceof OAuth2Server.OAuthError) {
                res.status(error.code || 500).json({
                    error: error.name,
                    error_description: error.message
                });
            } else {
                res.status(500).json({
                    error: 'server_error',
                    error_description: 'Internal server error'
                });
            }
        }
    };
}

/**
 * Authorize middleware
 */
function authorize(options = {}) {
    return async (req, res, next) => {
        try {
            const request = new OAuth2Server.Request(req);
            const response = new OAuth2Server.Response(res);
            
            // Authorize the request
            const code = await oauth.authorize(request, response, options);
            
            // Add code to request
            req.oauth = { code };
            
            // Send response
            res.set(response.headers);
            res.status(response.status || 200).json(response.body);
        } catch (error) {
            console.error('Authorize error:', error);
            
            // Handle OAuth errors
            if (error instanceof OAuth2Server.OAuthError) {
                res.status(error.code || 500).json({
                    error: error.name,
                    error_description: error.message
                });
            } else {
                res.status(500).json({
                    error: 'server_error',
                    error_description: 'Internal server error'
                });
            }
        }
    };
}

/**
 * Verify token middleware
 * This is a custom middleware that verifies a token and returns the token payload
 */
function verifyToken() {
    return async (req, res, next) => {
        try {
            const request = new OAuth2Server.Request(req);
            const response = new OAuth2Server.Response(res);
            
            // Authenticate the request
            const token = await oauth.authenticate(request, response, {});
            
            // Return token payload
            res.status(200).json({
                valid: true,
                user: token.user
            });
        } catch (error) {
            console.error('Token verification error:', error);
            
            // Handle OAuth errors
            if (error instanceof OAuth2Server.OAuthError) {
                res.status(401).json({
                    valid: false,
                    error: error.name,
                    error_description: error.message
                });
            } else {
                res.status(500).json({
                    valid: false,
                    error: 'server_error',
                    error_description: 'Internal server error'
                });
            }
        }
    };
}

module.exports = {
    oauth,
    authenticate,
    token,
    authorize,
    verifyToken
};
