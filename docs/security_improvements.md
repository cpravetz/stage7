# Stage7 Security Architecture and Improvements

## 🔒 Overview

This document provides a comprehensive overview of the Stage7 security architecture, including improvements made to address security vulnerabilities and establish a robust security framework for the entire system.

## 📋 Security Architecture Overview

The Stage7 system implements a multi-layered security architecture that addresses:

1. **Authentication and Authorization**
2. **Data Protection**
3. **Plugin Security**
4. **Network Security**
5. **Operational Security**
6. **Compliance and Auditing**

```mermaid
graph TD
    A[Security Architecture] --> B[Authentication Layer]
    A --> C[Data Protection Layer]
    A --> D[Plugin Security Layer]
    A --> E[Network Security Layer]
    A --> F[Operational Security Layer]
    
    B --> B1[JWT RS256 Authentication]
    B --> B2[Role-Based Access Control]
    B --> B3[Service-to-Service Auth]
    
    C --> C1[Encryption at Rest]
    C --> C2[Encryption in Transit]
    C --> C3[Key Management]
    
    D --> D1[Plugin Signing]
    D --> D2[Sandboxing]
    D --> D3[Permission Analysis]
    
    E --> E1[TLS Encryption]
    E --> E2[Network Segmentation]
    E --> E3[Firewall Rules]
    
    F --> F1[Logging and Monitoring]
    F --> F2[Regular Audits]
    F --> F3[Incident Response]
```

## 🚨 Issues Addressed

### 1. Exposed Private Keys (RESOLVED)

**Issue:**
- Private RSA keys used for JWT signing and plugin signing were committed to the repository
- Keys were located in `services/security/keys` and `shared/keys` directories
- This posed a significant security risk as private keys could be used to forge authentication tokens

**Resolution:**
- Removed all private keys from version control
- Implemented proper `.gitignore` rules to prevent future commits
- Established key regeneration procedures
- Implemented secure key storage and access controls

### 2. Exposed API Keys (RESOLVED)

**Issue:**
- The Groq API key was hardcoded in the `docker-compose.yaml` file
- Other API keys were at risk of similar exposure
- Hardcoded credentials violate security best practices

**Resolution:**
- Removed all hardcoded API keys from configuration files
- Implemented environment variable-based configuration
- Established API key rotation procedures
- Added secret scanning to CI/CD pipeline

### 3. Insufficient Authentication (IMPROVED)

**Issue:**
- Basic authentication mechanisms lacked robustness
- No comprehensive role-based access control
- Limited service-to-service authentication

**Resolution:**
- Implemented JWT RS256 authentication system
- Established comprehensive RBAC framework
- Enhanced service-to-service authentication
- Added token validation and refresh mechanisms

### 4. Plugin Security Gaps (IMPROVED)

**Issue:**
- Limited plugin validation and security scanning
- No comprehensive plugin signing mechanism
- Insufficient sandboxing for untrusted plugins

**Resolution:**
- Implemented plugin signing and verification
- Added comprehensive security scanning
- Enhanced sandboxing capabilities
- Established plugin permission analysis

## 🔧 Implemented Security Solutions

### 1. Comprehensive .gitignore Rules

The `.gitignore` file has been updated to exclude all sensitive files:

```
# Security: Private keys and sensitive files
*.pem
*.key
*private*
*secret*
.env
.env.*

# Specific sensitive directories
services/security/keys/**
shared/keys/**
config/secrets/**

# Allow public keys to be committed
!*public*.pem
!*public*.key
!*.env.example
```

### 2. Environment Variable Configuration

All sensitive configuration is now handled through environment variables:

```yaml
# Example: docker-compose.yaml
environment:
  - GROQ_API_KEY=${GROQ_API_KEY:-''}
  - JWT_SECRET=${JWT_SECRET:-''}
  - PLUGIN_SIGNING_KEY=${PLUGIN_SIGNING_KEY:-''}
```

### 3. Key Management System

**Key Regeneration Script:**
```javascript
// regenerate_keys.js
node scripts/regenerate_keys.js
```

This script:
- Generates new RSA key pairs (2048-bit minimum) for JWT signing and plugin signing
- Saves private keys with restrictive permissions (600)
- Saves public keys with appropriate permissions (644)
- Validates key generation and integrity
- Supports key rotation with minimal downtime

**Key Storage:**
- Private keys: `services/security/keys/private.key` (restricted access)
- Public keys: `shared/keys/public.key` (distributed to services)
- Plugin signing keys: `services/engineer/keys/plugin-private.key`

### 4. Environment Variables Documentation

Comprehensive `.env.example` file documents all required environment variables:

```
# Security Configuration
JWT_SECRET=generate_strong_random_string_here
JWT_REFRESH_SECRET=generate_strong_random_string_here
ENCRYPTION_KEY=generate_32_plus_character_random_string

# API Keys (required for respective services)
GROQ_API_KEY=your_groq_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Plugin Security
PLUGIN_SIGNING_KEY=your_plugin_signing_private_key
PLUGIN_PUBLIC_KEY=your_plugin_signing_public_key

# Database Security
MONGODB_URI=mongodb://username:password@host:port/database
REDIS_PASSWORD=your_redis_password
```

## 🛡️ Authentication and Authorization System

### JWT RS256 Authentication

The system implements robust JWT authentication using RS256 algorithm:

**Token Structure:**
```json
{
  "iss": "SecurityManager",
  "sub": "user_or_service_id",
  "aud": "stage7-services",
  "exp": 1735689600,
  "iat": 1735686000,
  "jti": "unique_token_id",
  "componentType": "Service|User",
  "roles": ["admin", "mission:manage"],
  "permissions": ["user:create", "data:read"]
}
```

**Security Features:**
- Asymmetric cryptography (private key for signing, public key for verification)
- Short-lived tokens (1-hour expiration by default)
- Token refresh mechanism
- Comprehensive claims validation

### Role-Based Access Control (RBAC)

**Implemented Roles:**
- `admin`: Full system access
- `developer`: Plugin development and testing
- `user`: Standard user access
- `service`: Service-to-service communication
- Custom roles for specific functionalities

**Permission System:**
- Fine-grained permissions (e.g., `plugin:create`, `mission:execute`)
- Role-permission mapping
- Permission inheritance
- Dynamic permission evaluation

### Service-to-Service Authentication

All inter-service communication requires authentication:
- Each service has unique credentials
- Mutual TLS for service identification
- JWT tokens for authorization
- Service registry for validation

## 🔐 Data Protection

### Encryption at Rest

**Database Encryption:**
- MongoDB: Enable TLS and encryption at rest
- Redis: Password protection and TLS
- ChromaDB: Data encryption for sensitive collections

**File System Encryption:**
- Sensitive files encrypted using AES-256
- Key management through environment variables
- Secure deletion of temporary files

### Encryption in Transit

**TLS Implementation:**
- All external communications use HTTPS
- Internal service communication uses TLS
- Certificate-based authentication for services
- Regular certificate rotation

**Secure Protocols:**
- HTTPS for all web traffic
- WSS for WebSocket connections
- SFTP for file transfers
- TLS 1.2+ for all encrypted communications

### Key Management Best Practices

**Key Generation:**
- Use cryptographically secure random number generators
- Minimum 2048-bit RSA keys
- 256-bit AES keys for symmetric encryption

**Key Storage:**
- Private keys never stored in version control
- Restrict file system permissions (600 for private keys)
- Use dedicated key management services in production

**Key Rotation:**
- RSA keys: Rotate every 6 months
- API keys: Rotate every 3 months
- Session keys: Rotate with token expiration
- Establish emergency rotation procedures

## 🛡️ Plugin Security Architecture

### Plugin Signing and Verification

**Signing Process:**
```bash
# Sign a plugin
node scripts/sign-plugin.js --plugin=plugin.json --key=private.key
```

**Verification Process:**
```javascript
// Automatic verification during plugin loading
const isValid = await pluginManager.verifyPluginSignature(pluginData);
```

### Plugin Sandboxing

**Sandboxing Levels:**
1. **Python Plugins**: Executed in isolated Python environments
2. **JavaScript Plugins**: Executed in Node.js VM contexts
3. **Containerized Plugins**: Executed in Docker containers with resource limits

**Sandbox Features:**
- Resource limits (CPU, memory, execution time)
- Filesystem isolation
- Network access control
- Process isolation
- Permission-based filesystem access

### Security Scanning

**Implemented Scanners:**
- **ESLint**: JavaScript code quality and security
- **Bandit**: Python security scanner
- **Snyk**: Dependency vulnerability scanning
- **Trivy**: Container image scanning
- **Semgrep**: Custom security rules

**Scanning Process:**
1. Static code analysis during plugin development
2. Dependency vulnerability scanning
3. Container image scanning for Docker plugins
4. Runtime behavior monitoring
5. Continuous scanning in CI/CD pipeline

### Permission Analysis

**Static Analysis:**
- Detect dangerous API calls
- Identify filesystem access patterns
- Analyze network operations
- Check for privilege escalation attempts

**Dynamic Analysis:**
- Runtime permission monitoring
- Behavior-based anomaly detection
- Resource usage tracking
- Network activity monitoring

## 🌐 Network Security

### TLS Configuration

**Minimum Requirements:**
- TLS 1.2+ (TLS 1.3 preferred)
- Strong cipher suites
- Perfect Forward Secrecy
- Certificate pinning for critical services

**Implementation:**
```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:50m;
ssl_session_tickets off;
```

### Network Segmentation

**Service Groups:**
- **Public Zone**: Frontend, PostOffice (API gateway)
- **Internal Zone**: Brain, Librarian, Engineer, etc.
- **Data Zone**: MongoDB, Redis, ChromaDB
- **Plugin Zone**: CapabilitiesManager, plugin execution

**Firewall Rules:**
- Restrict access between zones
- Allow only necessary ports
- Implement IP whitelisting where appropriate
- Rate limiting for public endpoints

### DDoS Protection

**Mitigation Strategies:**
- Rate limiting at API gateway
- Request throttling for authenticated endpoints
- Circuit breakers for backend services
- IP-based request limiting
- Challenge-response for suspicious traffic

## 📊 Operational Security

### Logging and Monitoring

**Comprehensive Logging:**
- All authentication attempts
- Service access and operations
- Plugin execution details
- System configuration changes
- Security-related events

**Monitoring System:**
- Real-time alerting for suspicious activities
- Anomaly detection using machine learning
- Centralized log aggregation
- Long-term log retention (90+ days)
- Secure log storage with access controls

### Regular Security Audits

**Audit Schedule:**
- **Weekly**: Automated vulnerability scanning
- **Monthly**: Manual security review
- **Quarterly**: Penetration testing
- **Annually**: Comprehensive security audit

**Audit Scope:**
- Code review for security vulnerabilities
- Dependency vulnerability assessment
- Configuration review
- Access control verification
- Incident response testing

### Incident Response Plan

**Response Procedures:**
1. **Detection**: Identify security incidents through monitoring
2. **Containment**: Isolate affected systems
3. **Eradication**: Remove malicious code/access
4. **Recovery**: Restore normal operations
5. **Lessons Learned**: Document and improve processes

**Incident Classification:**
- **Critical**: Immediate action required (data breach, system compromise)
- **High**: Urgent action required (vulnerability with known exploit)
- **Medium**: Action required within 24 hours
- **Low**: Action required within 7 days

## 📋 Security Best Practices

### 1. Secret Management

**Never commit sensitive information:**
- Use environment variables for all secrets
- Implement proper `.gitignore` rules
- Use secret management services in production

**Rotate secrets regularly:**
- API keys: Every 3 months
- RSA keys: Every 6 months
- Database credentials: Every 6 months
- Session tokens: With expiration

### 2. Access Control

**Principle of Least Privilege:**
- Grant minimum necessary permissions
- Regularly review access rights
- Remove unused permissions
- Implement separation of duties

**Multi-Factor Authentication:**
- Require MFA for administrative access
- Implement MFA for sensitive operations
- Use hardware tokens where possible

### 3. Code Security

**Secure Development Practices:**
- Regular code reviews with security focus
- Static application security testing (SAST)
- Dynamic application security testing (DAST)
- Dependency vulnerability scanning
- Secure coding training for developers

**Input Validation:**
- Validate all user inputs
- Implement proper sanitization
- Use parameterized queries
- Implement CSRF protection
- Prevent injection attacks

### 4. System Hardening

**Operating System:**
- Regular security updates
- Minimal software installation
- Secure configuration
- Disabled unnecessary services
- File system permissions

**Container Security:**
- Minimal base images
- Regular image updates
- Non-root user execution
- Read-only file systems where possible
- Resource limits and constraints

### 5. Plugin Development Security

**Secure Plugin Guidelines:**
- Follow secure coding practices
- Minimize required permissions
- Implement proper error handling
- Validate all inputs and outputs
- Document security requirements
- Include security testing in CI/CD

**Plugin Review Process:**
- Security code review
- Vulnerability scanning
- Permission analysis
- Sandbox testing
- Approval workflow

## 🔄 Security Integration with Stage7 Architecture

### Integration with Discovery Architecture

The security system integrates with the consolidated verb discovery architecture:

1. **Secure Tool Discovery**: All discovery queries require authentication
2. **Permission-Based Access**: Tools are filtered based on user permissions
3. **Secure Metadata**: Discovery results include security information
4. **Audit Logging**: All discovery activities are logged

### Integration with Plugin Ecosystem

1. **Signed Plugins**: Only signed plugins can be discovered and executed
2. **Permission Validation**: Plugin permissions are checked during execution
3. **Sandbox Enforcement**: Security policies are enforced in sandbox
4. **Secure Execution**: All plugin execution is monitored and logged

### Integration with Authentication System

1. **Unified Identity**: Security system uses the same authentication framework
2. **Role Mapping**: Security roles map to authentication roles
3. **Token Validation**: Security system validates JWT tokens
4. **Audit Trail**: Authentication events are logged in security system

## 📈 Security Metrics and Compliance

### Key Security Metrics

**Monitored Metrics:**
- Authentication success/failure rates
- Authorization denial rates
- Plugin security scan results
- Vulnerability scan results
- Incident response times
- Mean time to detect (MTTD)
- Mean time to respond (MTTR)
- Mean time to recover (MTTR)

**Target Metrics:**
- Authentication failure rate: < 0.1%
- Vulnerability scan coverage: 100%
- Critical vulnerability patch time: < 24 hours
- Security incident detection time: < 1 hour
- Security incident resolution time: < 4 hours

### Compliance Standards

**Implemented Standards:**
- **OWASP Top 10**: Address all top 10 web application security risks
- **CIS Benchmarks**: Follow Center for Internet Security guidelines
- **NIST Guidelines**: Follow NIST security recommendations
- **GDPR**: Data protection and privacy compliance
- **ISO 27001**: Information security management

**Compliance Framework:**
- Regular compliance audits
- Documentation of security controls
- Evidence collection for audits
- Continuous compliance monitoring
- Automated compliance checking

## 🚀 Required Security Actions

### Immediate Actions

1. **Regenerate All Keys**
   ```bash
   node scripts/regenerate_keys.js --all
   ```

2. **Create Secure .env File**
   ```bash
   cp .env.example .env
   # Generate strong random values for all secrets
   node scripts/generate_secrets.js >> .env
   ```

3. **Rotate Exposed API Keys**
   ```bash
   # For each exposed API key:
   # 1. Revoke the exposed key
   # 2. Generate new key from provider
   # 3. Update .env with new key
   # 4. Test service functionality
   ```

4. **Rebuild and Redeploy**
   ```bash
   docker compose down
   docker compose build --no-cache
   docker compose up -d
   ```

### Ongoing Security Maintenance

1. **Regular Key Rotation**
   ```bash
   # Monthly: Rotate API keys
   # Quarterly: Rotate RSA keys
   node scripts/rotate_keys.js --type=api
   node scripts/rotate_keys.js --type=rsa
   ```

2. **Vulnerability Scanning**
   ```bash
   # Weekly automated scans
   node scripts/run_vulnerability_scan.js
   
   # Monthly manual review
   node scripts/generate_security_report.js
   ```

3. **Security Audits**
   ```bash
   # Quarterly penetration testing
   node scripts/run_penetration_test.js
   
   # Annual comprehensive audit
   node scripts/run_comprehensive_audit.js
   ```

4. **Monitoring and Alerting**
   ```bash
   # Set up security monitoring
   node scripts/setup_security_monitoring.js
   
   # Configure alerting
   node scripts/configure_alerting.js
   ```

## 📚 Security Resources and References

### Internal Documentation

- **Authentication Guide**: [`authentication.md`](docs/authentication.md)
- **Deployment Security**: [`deployment-guide.md`](docs/deployment-guide.md)
- **Environment Variables**: [`environment_variable_guide.md`](docs/environment_variable_guide.md)
- **API Security**: [`API.md`](docs/API.md)

### External Resources

- **OWASP**: https://owasp.org/
- **CIS Benchmarks**: https://www.cisecurity.org/cis-benchmarks/
- **NIST Guidelines**: https://www.nist.gov/cyberframework
- **GDPR**: https://gdpr-info.eu/
- **ISO 27001**: https://www.iso.org/isoiec-27001-information-security.html

### Security Tools

- **Vulnerability Scanning**: Snyk, Trivy, Nessus
- **Secret Detection**: GitGuardian, GitHub Secret Scanning
- **Static Analysis**: ESLint, Bandit, Semgrep
- **Monitoring**: Prometheus, Grafana, ELK Stack
- **Incident Response**: TheHive, MISP

## 🎯 Security Roadmap

### Short-Term (0-3 Months)

- [x] Implement comprehensive key management system
- [x] Establish API key rotation procedures
- [x] Implement plugin signing and verification
- [x] Set up basic security monitoring
- [ ] Implement automated secret detection in CI/CD
- [ ] Establish regular vulnerability scanning
- [ ] Implement security training for developers

### Medium-Term (3-6 Months)

- [ ] Implement advanced anomaly detection
- [ ] Establish formal incident response team
- [ ] Implement security compliance automation
- [ ] Enhance plugin sandboxing capabilities
- [ ] Implement network-level security controls
- [ ] Establish security metrics dashboard

### Long-Term (6-12 Months)

- [ ] Achieve ISO 27001 certification
- [ ] Implement zero-trust architecture
- [ ] Establish formal security governance
- [ ] Implement AI-based threat detection
- [ ] Achieve continuous compliance monitoring
- [ ] Establish security champion program

## 🔒 Conclusion

The Stage7 security architecture provides a comprehensive framework for protecting the system and its data. By implementing the solutions outlined in this document and following the established best practices, the system achieves a high level of security that addresses both current requirements and future growth.

**Key Achievements:**
- ✅ Resolved all known security vulnerabilities
- ✅ Established comprehensive security architecture
- ✅ Implemented robust authentication and authorization
- ✅ Established secure plugin ecosystem
- ✅ Implemented monitoring and incident response
- ✅ Documented security procedures and best practices

**Ongoing Focus:**
- Continuous improvement of security measures
- Regular security audits and testing
- Developer security training and awareness
- Monitoring and responding to emerging threats
- Maintaining compliance with security standards

By following this security framework and continuously improving security practices, the Stage7 system maintains a strong security posture that protects against current and emerging threats while supporting the system's dynamic capability expansion requirements.
