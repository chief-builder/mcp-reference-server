Currently the OAuth flow auto-approves at line 216-232 in src/api/oauth-router.ts - it immediately generates a code without asking for credentials.                                
                                                                                                                                                                                     
  To add a proper username/password login, we need:                                                                                                                                  
                                                                                                                                                                                     
  1. Login page - HTML form served at /oauth/authorize (instead of auto-redirect)                                                                                                    
  2. Login handler - POST endpoint to validate credentials                                                                                                                           
  3. User store - Even a simple hardcoded user for demo purposes                                                                                                                     
  4. Session flow - Show form → validate → then issue authorization code   

  Use Environment-based credentials - Read from OAUTH_TEST_USER / OAUTH_TEST_PASSWORD.
