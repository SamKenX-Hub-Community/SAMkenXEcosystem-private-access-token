import { Base64, DataBuffer, CBOR} from './utils.js';

import { hash_to_field } from '@noble/curves/abstract/hash-to-curve';
import { p384 as ec, hashToCurve} from '@noble/curves/p384';
import { sha384, sha512 } from '@noble/hashes/sha512';
const Point = ec.ProjectivePoint;

const NONCE_LENGTH = 64;
const DEFAULT_HOST = "https://localhost:8444";

const VOPRF_P384 = {
    // https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf
    name: "P-384",
    // modulus prime number
    // p: 39402006196394479212279040100143613805079739270465446667948293404245721771496870329047266088258938001861606973112319n,
    MODULUS: ec.CURVE.p,
    // Curve order, total count of valid points in the field.
    // n: 39402006196394479212279040100143613805079739270465446667946905279627659399113263569398956308152294913554433653942643n,
    ORDER: ec.CURVE.n,
    // Base (generator) point (x, y)
    // Gx: 26247035095799689268623156744566981891852923491109213387815615900925518854738050089022388053975719786650872476732087n,
    // Gy: 8325710961489029985546751289520108179287853048861315594709205902480503199884419224438643760392947333078086511627871n,
    // h: 1n,
    BITS: 384,
    BYTES: 384 / 8,
};

/**
 * An elliptic curve point used in elliptic curve operations over the curve P-384.
 *
 * Scalar multiplication can be written as `s*p` or `p*s`, where `s` is a
 * `Scalar` and `p` is an `ECPoint`. An `ECPoint` is encoded as an X9.62
 * uncompressed point.
 *
 * @param {Buffer} value An X9.62 encoded elliptic curve point.
 * @param {PointJacobi} point The `PointJacobi` representation of the point.
 */
export class ECPoint {
    /**
     * @param {Array<number>} value The byte string to read values from.
     */
    constructor(value) {
        if (value instanceof Point) {
            this.#point = value;
            this.#value = Array.from(value.toRawBytes(false));
        }
        else {
            this.#value = value;
            this.#point = ec.ProjectivePoint.fromHex(Uint8Array.from(this.#value));
        }
    }

    #value;
    #point;

    /**
     * @returns {Buffer} The point as an X9.62 uncompressed byte string.
     */
    toBytes() {
        return this.#value;
    }

    /**
     * @returns {string} The point as a Base64 string.
     */
    toString() {
        return Base64.encode(this.toBytes());
    }

    multiply(scalar) {
        return new ECPoint(this.#point.multiply(scalar));
    }

    toPoint() {
        return this.#point;
    }

    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }
}

/**
 * A public key for a trust token issuer.
 * The value of a secret key is a scalar. The secret key is used to sign
 * blinded tokens from the client.
 */
export class PrivateStateTokenSecretKey {
    /**
     * @param {number} id The ID of the secret key.
     * @param {number} scalar The value of the secret key.
     * @param {number} expiry The expiry time of the secret key.
     */
    constructor(id, scalar, expiry) {
        this.id = id;
        this.scalar = scalar;
        this.expiry = expiry;
    }

    static from(id, value, expiry) {
        if (typeof value === 'string') {
            value = Base64.decode(value);
        }
        if (value instanceof Uint16Array || Array.isArray(value)) {
            value = DataBuffer.bytesToNumber(Array.from(value));
        }
        return new PrivateStateTokenSecretKey(id, value, expiry);
    }

    /**
     * @returns {Buffer} Returns the value of the secret key as bytes.
     */
    toBytes() {
        return DataBuffer.numberToBytes(this.scalar, 48);
    }

    /**
     *
     * @returns {string} Returns the value of the secret key as a Base64 string.
     */
    toString() {
        return Base64.encode(this.toBytes());
    }
}

/**
 * A public key for a trust token issuer.
 * The value of a public key is an elliptic curve point. A public key is
 * generated from a secret key.
 */
export class PrivateStateTokenPublicKey {

    /**
     * @param {number} id The ID of the public key
     */
    id;

    /**
     * TODO: retain in X/Y coordinates rather than in scalar form?
     * @param {number} scalar The scalar value of the public key. ()
     */
    scalar;

    /**
     * @param {number} expiry The expiry time of the public key.
     */
    expiry;

    /**
     * @param {number} id The ID of the public key.
     * @param {number} scalar The value of the public key.
     * @param {number} expiry The expiry time of the public key.
     */
    constructor(id, scalar, expiry) {
        this.id = id;
        this.scalar = scalar;
        this.expiry = expiry;
    }

    static from(id, value, expiry) {
        if (typeof value === 'string') {
            value = Base64.decode(value);
        }
        if (ArrayBuffer.isView(value) || Array.isArray(value)) {
            value = DataBuffer.bytesToNumber(Array.from(value));
        }
        return new PrivateStateTokenPublicKey(id, value, expiry);
    }

    static fromXY(id, x, y, expiry) {
        const bytes = [].concat([0x04], x, y);
        // const scalar = DataBuffer.bytesToNumber(bytes);
        return PrivateStateTokenPublicKey.from(id, bytes, expiry);
    }

    toXY() {
        const bytes = this.toBytes();
        const x = Base64.urlEncode(bytes.slice(1, VOPRF_P384.BYTES + 1));
        const y = Base64.urlEncode(bytes.slice(VOPRF_P384.BYTES + 2));
        return {x, y};
    }

    /**
     *
     * @returns {Array<number>} Returns the public key as bytes.
     */
    toBytes() {
        return DataBuffer.numberToBytes(this.scalar, VOPRF_P384.BYTES * 2 + 1); // 384 *2 + 1 or 0x04 + x + y
    }

    /**
     * @returns {string} Returns the public key as a Base64 string suitable for use in key commitments.
     */
    toString() {
        return Base64.encode(this.toBytes());
    }
}

/**
 * A key pair for a trust token issuer.
 */
export class PrivateStateTokenKeyPair {

    /**
     * @param {PrivateStateTokenPublicKey} publicKey The public key
     */
    publicKey;

    /**
     * @param {PrivateStateTokenSecretKey} secretKey The secret key
     */
    secretKey;

    /**
     * @param {number} id The ID associated with the key pair.
     */
    #id;

    /**
     * @returns {number} The ID associated with the key pair.
     */
    get id() {
        return this.#id;
    }

    /**
     * @param {number} value The ID associated with the key pair. Also sets the ID of the public and secret keys.
     */
    set id(value = 0) {
        this.#id = value;
        this.publicKey.id = value;
        this.secretKey.id = value;
    }

    /**
     * @returns {number} The expiry of the key pair.
     */
    #expiry;

    /**
     * @returns {number} The expiry of the key pair.
     */
    get expiry() {
        return this.#expiry;
    }

    /**
     * @param {number} value The expiry of the key pair. Also sets the expiry of the public and secret keys.
     */
    set expiry(value = 0) {
        this.#expiry = value;
        this.publicKey.expiry = value;
        this.secretKey.expiry = value;
    }

    /**
     * @param {number} id The ID associated with the key pair.
     * @param {PrivateStateTokenPublicKey} publicKey The public component of the key pair.
     * @param {PrivateStateTokenSecretKey} secretKey The secret component of the key pair.
     * @param {number} expiry The expiry of the key pair.
     */
    constructor(id, publicKey, secretKey, expiry) {
        this.#id = id || secretKey.id || 0;
        this.publicKey = publicKey;
        this.secretKey = secretKey;

        expiry = expiry || this.secretKey.expiry || this.publicKey.expiry || Date.now() + 90*24*60*60*1000; //+90 days default
        // quick sanitation to ensure that we are in microseconds
        expiry = expiry * (10**(Math.ceil(Math.max(16-Math.ceil(Math.log10(expiry)), 0)/3)*3))
        this.expiry = expiry;
        this.publicKey.expiry = expiry;
        this.secretKey.expiry = expiry;
    }

    /**
     * Convenience method to produce a valid JWK representation of the key pair.
     * @returns {Object} Returns a JWK representation of the key pair.
     */
    toJWK() {
        const {x, y} = this.publicKey.toXY();
        return {
            kty: 'EC',
            crv: 'P-384',
            kid: this.id,
            x,
            y,
            d: this.secretKey.toString(),
        };
    }

    /**
     * Creates a key pair from a JWK representation. Assumes a structure with the following fields:
     * - kty: 'EC'
     * - crv: 'P-384'
     * - kid: The ID associated with the key pair.
     * - x: The x coordinate of the public key.
     * - y: The y coordinate of the public key.
     * - d: The value of the secret key.
     * - exp: The expiry of the key pair in seconds since the epoch.
     *
     * @param {Object} jwk The JWK representation of the key pair.
     * @param {number} id The ID associated with the key pair. (If not present in the jwk definition)
     * @returns {PrivateStateTokenKeyPair} The key pair.
     */
    static fromJWK(jwk, id=0) {
        const keyID = id || jwk.kid || 0;
        const x = Base64.decode(jwk.x);
        const y = Base64.decode(jwk.y);
        const d = Base64.decode(jwk.d);
        // jwk typically uses milliseconds for the exp field, we need microseconds
        const expiry = jwk.exp;

        const publicKey = PrivateStateTokenPublicKey.fromXY(keyID, x, y, expiry);
        const secretKey = PrivateStateTokenSecretKey.from(keyID, d, expiry);
        return new PrivateStateTokenKeyPair(keyID, publicKey, secretKey, expiry);
    }

    /**
     * Generates a key pair for a trust token issuer.
     * For testing purposes, the secret value is fixed. The public value is the
     * product of the secret value and the generator of P-384.
     *
     * @param {number} id The ID associated with the key pair.
     * @returns {PrivateStateTokenKeyPair} The key pair.
     */
    static generate(id = 0) {
        // const priv = VOPRF_P384.ORDER - 1n;
        // priv cannot be 0
        const priv = ec.utils.randomPrivateKey();
        const pub = ec.getPublicKey(priv, false);

        const publicKey = PrivateStateTokenPublicKey.from(id, pub);
        const secretKey = PrivateStateTokenSecretKey.from(id, priv);
        return new PrivateStateTokenKeyPair(id, publicKey, secretKey);
    }

    static get TEST_JWK() {
        return PrivateStateTokenKeyPair.fromJWK({
            kty: 'EC',
            crv: 'P-384',
            kid: 0,
            x: 'qofKIr6LBTeOscce8yCtdG4dO2KLp5uYWfdB4IJUKjhVAvJdv1UpbDpUXjhydgq3',
            y: 'yeghtWnZ05CiYWdAbW0j1gcL4kLXZeuDFiXO7EoPRz71n04w4oF-YoW84oRvFfGg',
            d: '////////////////////////////////x2NNgfQ3Ld9YGg2ySLCneuzsGWrMxSly',
            // Friday, December 31, 9999 11:59:59 PM GMT
            exp: 253402300799
        });
    }
}

/**
 * A trust token issuance request.
 */
export class IssueRequest {
    /**
     * @param {Array<ECPoint>} nonces A list of elliptic curve points to be used as token nonces.
     */
    constructor(nonces) {
        this.nonces = nonces;
    }

    /**
     * @returns {number} The number of token nonces in the request.
     */
    get count() {
        return this.nonces.length;
    }

    /**
     * Creates an `IssueRequest` from a Base64 string.
     *
     * The decoded byte string must have the form:
     * ```
     * struct {
     *   uint16 count;
     *   ECPoint nonces[count];
     * } IssueRequest;
     * ```
     * @param {string} s The Base64 string to decode.
     * @returns {IssueRequest} Returns the decoded `IssueRequest`.
     */
    static from(s) {
        const decodedBytes = Base64.decode(s);
        const bytes = new DataBuffer(decodedBytes);

        const count = bytes.readInt(2);
        const nonces = [];
        while (nonces.length < count) {
            const value = bytes.readBytes(VOPRF_P384.BYTES*2+1);
            try {
                const ecPoint = new ECPoint(value);
                nonces.push(ecPoint);
            }
            catch {
                // null;
            }
        }

        return new IssueRequest(nonces.filter(n => n !== null));
    }

    /**
     *
     * @returns {Array<number>} Returns the byte encoding of the request.
     */
    toBytes() {
        const bytes = new DataBuffer();
        bytes.writeInt(this.count, 2);
        for (const nonce of this.nonces) {
            bytes.writeBytes(nonce.toBytes());
        }
        return bytes.buffer;
    }

    /**
     *
     * @returns {string} Returns the Base64 encoding of the request.
     */
    toString() {
        return Base64.encode(this.toBytes());
    }

    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }
}

/**
 * A trust token public key.
 */
export class IssueResponse {

    /**
     * @param {number} keyID The ID of the key used for signing.
     * @param {Array<ECPoint>} signed The list of signed nonces.
     * @param {Array<number>} proof The DLEQ proof.
     */
    constructor(keyID, signed, proof) {
        this.keyID = keyID;
        this.signed = signed;
        this.proof = proof;
    }

    /**
     * @returns {number} The number of issued tokens.
     */
    get issued() {
        return this.signed.length;
    }

    /**
     * Returns the issue response as bytes.
     * The structure has the form:
     * ```
     * struct {
     *   uint16 issued;
     *   uint32 key_id = keyID;
     *   SignedNonce signed[issued];
     *   opaque proof<1..2^16-1>; // Length-prefixed form of DLEQProof.
     * } IssueResponse;
     *
     * @returns {Array<number>} The issue response as bytes.
     */
    toBytes() {
        const buf = new DataBuffer();
        buf.writeInt(this.issued, 2);
        buf.writeInt(this.keyID, 4);
        for (const nonce of this.signed) {
            buf.writeBytes(nonce.toBytes());
        }
        buf.writeInt(this.proof.length, 2);
        buf.writeBytes(this.proof);
        return buf.toBytes();
    }

    /**
     * @returns {string} The issue response as a Base64 string.
     */
    toString() {
        return Base64.encode(this.toBytes());
    }

    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }
}

/**
 * A trust token redemption request.
 */
export class RedeemRequest {
    /**
     * @param {number} keyID The ID of the key used to sign the trust token.
     * @param {Uint8Array} nonce The nonce part of the token.
     * @param {ECPoint} point The elliptic curve point part of the token.
     * @param {Uint8Array} clientData Client data associated with the request.
     */
    constructor(keyID, nonce, point, clientData) {
        this.keyID = keyID;
        this.nonce = nonce;
        this.point = point;
        this.clientData = clientData;
    }

    decodeClientData() {
        return CBOR.decode(this.clientData);
    }

    /**
     * Creates a `RedeemRequest` from a Base64 string.
     *
     * The decoded byte string must have the form:
     * ```
     * struct {
     *   uint32 key_id;
     *   opaque nonce<nonce_size>;
     *   ECPoint W;
     * } Token;
     *
     * struct {
     *   opaque token<1..2^16-1>; // Bytestring containing a serialized Token struct.
     *   opaque client_data<1..2^16-1>;
     * } RedeemRequest;
     *
     * ```
     * @param {string} s The Base64 string to decode.
     * @returns {RedeemRequest} Returns the decoded `RedeemRequest` from `sec-private-state-token` http header
     */
    static from(s) {
        const decodedBytes = Base64.decode(s);
        const bytes = new DataBuffer(decodedBytes);

        const tokenLen = bytes.readInt(2);
        const keyID = bytes.readInt(4);
        const nonce = bytes.readBytes(NONCE_LENGTH);

        const value = bytes.readBytes(VOPRF_P384.BYTES * 2 + 1);
        const point = new ECPoint(value);

        const clientDataLen = bytes.readInt(2);
        const clientData = bytes.readBytes(clientDataLen);

        return new RedeemRequest(keyID, nonce, point, clientData);
    }

    /**
     *
     * @returns {Array<number>} The redeem request as bytes.
     */
    toBytes() {
        const buf = new DataBuffer();
        buf.writeInt(this.nonce.length + this.point.toBytes().length + 4, 2);
        buf.writeInt(this.keyID, 4);
        buf.writeBytes(this.nonce);
        buf.writeBytes(this.point.toBytes());
        buf.writeInt(this.clientData.length, 2);
        buf.writeBytes(this.clientData);
        return buf.toBytes();
    }

    /**
     *
     * @returns {string} The redeem request as a Base64 string.
     */
    toString() {
        return Base64.encode(this.toBytes());
    }

    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }
}

/**
 * The response to a trust token redemption request.
 * The client should treat the entire response as the redemption record.
 *
 * @see https://github.com/WICG/trust-token-api/blob/main/ISSUER_PROTOCOL.md#redeem-function
 *
 * RedemptionResponse structure as defined below.
 * ```
 * struct {
 *   opaque rr<1..2^16-1>;
 * } RedeemResponse;
 * ```
 */
export class RedeemResponse {
    /**
     * @param {Array<number>|string} record The redemption record.
     */
    constructor(record = []) {
        if (ArrayBuffer.isView(record)) {
            record = Array.from(record);
        }
        else if (!Array.isArray(record)) {
            record = DataBuffer.stringToBytes(record);
        }
        this.record = record;
    }

    /**
     * @returns {Array<number>} The redemption record as bytes.
     */
    toBytes() {
        return this.record;
    }

    /**
     * @returns {string} The redemption record as a Base64 string.
     */
    toString() {
        return Base64.encode(this.record);
    }

    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }
}

/**
 * A trust token issuer implementation.
 * @see https://wicg.github.io/trust-token-api/#issuer-public-keys
 */
export class PrivateStateTokenIssuer {

    static get KEY_COMMITMENT_ID() {
        return 1;
    }

    static PrivateStateTokenV3VOPRF = {
        name: "PrivateStateTokenV3VOPRF",
        suite: "P384_XMD:SHA-512_SSWU_RO_",
        hash: sha512,
        hashToGroupDST: "TrustToken VOPRF Experiment V2 HashToGroup\0",
        hashToScalarDST: "TrustToken VOPRF Experiment V2 HashToScalar\0",
    };

    static PrivateStateTokenV1VOPRF = {
        name: "PrivateStateTokenV1VOPRF",
        suite: "P384_XMD:SHA-384_SSWU_RO_",
        hash: sha384,
        hashToGroupDST: "HashToGroup-OPRFV1-\x01-P384-SHA384\0",
        hashToScalarDST: "HashToScalar-OPRFV1-\x01-P384-SHA384\0",
    };

    static VERSIONS = new Map([
        ["PrivateStateTokenV3VOPRF", PrivateStateTokenIssuer.PrivateStateTokenV3VOPRF],
        ["PrivateStateTokenV1VOPRF", PrivateStateTokenIssuer.PrivateStateTokenV1VOPRF]
    ]);

    static DEFAULT_VERSION = "PrivateStateTokenV3VOPRF";

    /**
     * @param {string} host The server origin for this issuer.
     * @param {number} maxBatchSize The max batch size for tokens.
     * @param {Array<PrivateStateTokenKeyPair>} keys The key pairs for this issuer.
     */
    constructor(host, maxBatchSize, keys = []) {
        if (!Array.isArray(keys)) keys = [keys];

        this.#keys = new Map(keys.map(k => [k.id, k]));
        this.maxBatchSize = maxBatchSize;
        this.host = host;
    }

    /**
     * The private keys for this issuer.
     */
    #keys;

    /**
     * The public keys for this issuer. We intentionally don't make the private keys accessible
     */
    get publicKeys() {
        return [...this.#keys.values()].map(k => k.publicKey);
    }

    /**
     * Adds a key pair to the issuer.
     * @param {PrivateStateTokenKeyPair} key The key pair to add.
     * @returns {PrivateStateTokenIssuer} This issuer. Useful for chaining.
     */

    addKey(key) {
        this.#keys.set(key.id, key);
        return this;
    }

    /**
     * Adds a key pair from a JWK definition.
     * @param {Object} jwk A JWK definition.
     * @see https://tools.ietf.org/html/rfc7517
     * @returns {PrivateStateTokenIssuer} This issuer (for chaining)
     */
    addJWK(jwk) {
        const key = PrivateStateTokenKeyPair.fromJWK(jwk);
        this.addKey(key);

        return this;
    }

    /**
     * Produces a key commitment for this issuer. The structure for the key commitment is only partially documented in
     * the spec, the web tests provide more details that include the host and max batch size.
     *
     * @param {string} version The version of the protocol to use.
     * @returns {Object} The key commitment.
     * @see https://github.com/WICG/trust-token-api/blob/main/ISSUER_PROTOCOL.md#issuer-key-commitments
     * @see https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/web_tests/wpt_internal/trust-tokens/resources/trust_token_voprf.py;l=449-469
     */
    keyCommitment(version = PrivateStateTokenIssuer.DEFAULT_VERSION) {
        const protocol = PrivateStateTokenIssuer.getVersionConfig(version);
        const keyCommitment = {
            "protocol_version": protocol.name,
            "id": PrivateStateTokenIssuer.KEY_COMMITMENT_ID,
            "batchsize": this.maxBatchSize,
            "keys": {}
        };
        for (const key of this.publicKeys) {

            // Returns the public key as bytes.
            // The structure takes the form:
            // ```
            // struct {
            //    uint32 id;
            //    ECPoint pub;
            // } TrustTokenPublicKey;
            // ```
            const buffer = new DataBuffer();
            buffer.writeInt32(key.id);
            buffer.writeBytes(key.toBytes());

            const publicKey = Base64.encode(buffer.toBytes());
            const expiry = key.expiry;

            keyCommitment.keys[key.id] = {
                "Y": publicKey,
                // epoch timestamp in microseconds
                // string escaped integer
                expiry: `${expiry}`,
            };
        }
        return {
            [this.host]: {
                [protocol.name]: keyCommitment
            }
        };
    }

    /**
     * Creates a trust token issuer. A key pair is generated and used to
     * initialize the issuer.
     *
     * @param {string} host The server origin for this issuer.
     * @param {number} maxBatchSize The max batch size for trust tokens.
     * @param {number} id The id for the key pair.
     * @returns {PrivateStateTokenIssuer} The trust token issuer with a generated key pair.
     */
    static generate(host = DEFAULT_HOST, maxBatchSize = 10, id=0) {
        const keyPair = PrivateStateTokenKeyPair.generate(id);
        const issuer = new PrivateStateTokenIssuer(host, maxBatchSize, keyPair);
        return issuer;
    }

    /**
     * provides the necessary configuration details that differs between versions of PST
     * TODO: remove legacy v3 definition
     * @param {string} version The version of PST to use
     * @param {string} name The name of the protocol
     * @returns {Object} The configuration details for the given version
     */
    static getVersionConfig(version = "PrivateStateTokenV3VOPRF") {
        return PrivateStateTokenIssuer.VERSIONS.get(version) || PrivateStateTokenIssuer.VERSIONS.get(PrivateStateTokenIssuer.DEFAULT_VERSION);
    }

    /**
     * Parses an issuance request and returns a response with a valid DLEQ proof.
     *
     * From: https://github.com/WICG/trust-token-api/blob/main/ISSUER_PROTOCOL.md#issue-function-1
     * > The Issue Evaluate stage of the VOPRF protocol.
     * > Input Serialization:
     * >   The Private State Token Issuance Request contains an IssueRequest structure defined below.
     * >   struct {
     * >     uint16 count;
     * >     ECPoint nonces[count];
     * >   } IssueRequest;
     * >
     * > Output Serialization:
     * >   The Private State Token Issuance Response contains an IssueResponse structure defined below.
     * >    struct {
     * >     opaque s<Nn>; // big-endian bytestring
     * >     ECPoint W;
     * >   } SignedNonce;
     *
     * >   struct {
     * >     Scalar c;
     * >     Scalar u;
     * >     Scalar v;
     * >   } DLEQProof;
     * >
     * >   struct {
     * >     uint16 issued;
     * >     uint32 key_id = keyID;
     * >     SignedNonce signed[issued];
     * >     opaque proof<1..2^16-1>; // Length-prefixed form of DLEQProof.
     * >   } IssueResponse;
     *
     * From: https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-voprf-21#section-3.3.2
     *
     * > The VOPRF protocol begins with the client blinding its input ...
     * > Clients store the output blind locally and send blindedElement to the server for evaluation.
     * > Upon receipt, servers process blindedElement to compute an evaluated element and DLEQ proof
     * > using the following BlindEvaluate function.
     * >
     * > ```
     * > Input:
     * >   Scalar skS
     * >   Element pkS
     * >   Element blindedElement
     * >
     * > Output:
     * >   Element evaluatedElement
     * >   Proof proof
     * >
     * > Parameters:
     * >   Group G
     * >
     * > def BlindEvaluate(skS, pkS, blindedElement):
     * >   evaluatedElement = skS * blindedElement
     * >   blindedElements = [blindedElement]     // list of length 1
     * >   evaluatedElements = [evaluatedElement] // list of length 1
     * >   proof = GenerateProof(skS, G.Generator(), pkS,
     * >                         blindedElements, evaluatedElements)
     * >   return evaluatedElement, proof
     * > ```
     *
     * From https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-voprf-21#section-2.1
     *
     * > HashToScalar(x): Deterministically maps an array of bytes x to an element in GF(p).
     * > This function is optionally parameterized by a DST;
     *
     * From https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-voprf-21#section-4.4
     *
     * > Order():
     * >   Return 0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973.
     *
     * > HashToScalar():
     * >   Use hash_to_field from [I-D.irtf-cfrg-hash-to-curve] using L = 72, expand_message_xmd with SHA-384,
     * >   DST = "HashToScalar-" || contextString, and prime modulus equal to Group.Order()
     *
     * hash_to_field is defined in https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve-16#section-3

     * @param {number} keyId The key ID to use for this issuance.
     * @param {IssueRequest} request The issuance request.
     * @param {string} version The version of PST to use
     * @returns {IssueResponse} The issuance response.
     */
    issue(keyId, request, version=PrivateStateTokenIssuer.DEFAULT_VERSION) {
        const keyPair = this.#keys.get(keyId);

        // TODO: validate host
        // TODO: is null the right way to handle errors?
        if (!keyPair) return null;

        const config = PrivateStateTokenIssuer.getVersionConfig(version);
        const hashTofieldConfig = {
            DST: config.hashToScalarDST,
            m: 1,
            p: VOPRF_P384.ORDER,
            k: 192,
            expand: 'xmd',
            hash: config.hash
        }

        const secretKey = keyPair.secretKey;
        const count = request.nonces.length;

        const exponentList = [];
        const signedNonces = [];

        let batch = Array.from(keyPair.publicKey.toBytes());
        for (const blindedToken of request.nonces) {
            // const blindedToken = request.nonces[i];
            const z = blindedToken.multiply(secretKey.scalar);
            signedNonces.push(z);

            batch = batch.concat(blindedToken.toBytes());
            batch = batch.concat(z.toBytes());
        }

        // Batch DLEQ
        for (let i = 0; i < count; i++) {
            const buf = new DataBuffer();
            buf.writeString("DLEQ BATCH\0");
            buf.writeBytes(batch);
            buf.writeInt(i, 2);
            const exponent = hash_to_field(Uint8Array.from(buf.toBytes()), 1, hashTofieldConfig)[0][0];
            exponentList.push(exponent);
        }

        let blindedTokenBatch = ec.ProjectivePoint.ZERO;
        for (let i = 0; i < count; i++) {
            const blindedToken = request.nonces[i];
            const exponent = exponentList[i];
            blindedTokenBatch = blindedTokenBatch.add(blindedToken.toPoint().multiply(exponent));
        }

        let zBatch = ec.ProjectivePoint.ZERO;
        for (let i = 0; i < count; i++) {
            const z = signedNonces[i];
            const e = exponentList[i];
            zBatch = zBatch.add(z.toPoint().multiply(e));
        }
        const proof = this.#generateDLEQProof(keyPair, blindedTokenBatch, zBatch);

        return new IssueResponse(keyId, signedNonces, proof);
    }

    /**
     * Generates the DLEQ proof for the issuance.
     * From https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-voprf-21#section-2.2.1
     * > Generating a proof is done with the GenerateProof function, defined below. Given elements A and B,
     * > two non-empty lists of elements C and D of length m, and a scalar k; this function produces a proof
     * > that k*A == B and k*C[i] == D[i] for each i in [0, ..., m - 1]. The output is a value of type Proof,
     * > which is a tuple of two Scalar values. We use the notation proof[0] and proof[1] to denote the first
     * > and second elements in this tuple, respectively.
     * >
     * > GenerateProof accepts lists of inputs to amortize the cost of proof generation. Applications can take
     * > advantage of this functionality to produce a single, constant-sized proof for m DLEQ inputs, rather
     * > than m proofs for m DLEQ inputs.
     * >
     * > ```
     * > Input:
     * >   Scalar k
     * >   Element A
     * >   Element B
     * >   Element C[m]
     * >   Element D[m]
     * > Output:
     * >   Proof proof
     * > Parameters:
     * >   Group G
     * >
     * > def GenerateProof(k, A, B, C, D)
     * >   (M, Z) = ComputeCompositesFast(k, B, C, D)
     * >
     * >   r = G.RandomScalar()
     * >   t2 = r * A
     * >   t3 = r * M
     * >
     * >   Bm = G.SerializeElement(B)
     * >   a0 = G.SerializeElement(M)
     * >   a1 = G.SerializeElement(Z)
     * >   a2 = G.SerializeElement(t2)
     * >   a3 = G.SerializeElement(t3)
     * >
     * >   challengeTranscript =
     * >     I2OSP(len(Bm), 2) || Bm ||
     * >     I2OSP(len(a0), 2) || a0 ||
     * >     I2OSP(len(a1), 2) || a1 ||
     * >     I2OSP(len(a2), 2) || a2 ||
     * >     I2OSP(len(a3), 2) || a3 ||
     * >     "Challenge"
     * >
     * >   c = G.HashToScalar(challengeTranscript)
     * >   s = r - c * k
     * >
     * >   return [c, s]
     * > ```
     *
     * The same defnitions for HashToScalar apply as in the VOPRF specification above.
     *
     * @param {PrivateStateTokenKeyPair} keyPair The issuer's key pair.
     * @param {Point} btBatch The batched form of the blinded tokens.
     * @param {Point} zBatch The batched form of the signed tokens.
     * @param {string} version The version of the PrivateStateTokenVOPRF protocol to use.
     * @returns {Array<number>} The DLEQ proof.
     */
    #generateDLEQProof(keyPair, btBatch, zBatch, version="PrivateStateTokenV3VOPRF") {
        // Fix the random number r.
        // TODO: this is bad, but useful for testing. refactor.
        const r = VOPRF_P384.ORDER - 1n;

        const config = PrivateStateTokenIssuer.getVersionConfig(version);
        const hashTofieldConfig = {
            DST: config.hashToScalarDST,
            m: 1,
            p: VOPRF_P384.ORDER,
            k: 192,
            expand: 'xmd',
            hash: config.hash
        }

        const k0 = ec.ProjectivePoint.BASE.multiply(r);
        const k1 = btBatch.multiply(r);

        const buf = new DataBuffer();
        buf.writeString("DLEQ\0");
        buf.writeBytes(keyPair.publicKey.toBytes());
        buf.writeBytes(btBatch.toRawBytes(false));
        buf.writeBytes(zBatch.toRawBytes(false));
        buf.writeBytes(k0.toRawBytes(false));
        buf.writeBytes(k1.toRawBytes(false));

        const c = hash_to_field(Uint8Array.from(buf.toBytes()), 1, hashTofieldConfig)[0][0];

        const u = (r + c * keyPair.secretKey.scalar) % VOPRF_P384.ORDER;

        const result = [].concat(
            DataBuffer.numberToBytes(c, VOPRF_P384.BYTES),
            DataBuffer.numberToBytes(u, VOPRF_P384.BYTES)
        );
        return result;
    }

    /**
     * This method evaluates a redemption request. If it is valid (using the Evaluate() method of V/OPRF)
     * will return the redemption record. Again we are using the Group P-384
     *
     * From https://github.com/WICG/trust-token-api/blob/main/ISSUER_PROTOCOL.md#redeem-function-1
     * > The Redeem function corresponds to the VerifyFinalize stage of the VOPRF protocol.
     * > Input Serialization:
     * >   The Private State Token redemption request contains a RedemptionRequest structure as defined below.
     * >   struct {
     * >     uint32 key_id;
     * >     opaque nonce<nonce_size>;
     * >     ECPoint W;
     * >   } Token;
     * >   struct {
     * >     opaque token<1..2^16-1>; // Bytestring containing a serialized Token struct.
     * >     opaque client_data<1..2^16-1>;
     * >     uint64 redemption_time;
     * >   } RedeemRequest;
     * > Output Serialization:
     * >   The Private State Token redemption response contains a RedemptionResponse structure as defined below.
     * >   struct {
     * >     opaque rr<1..2^16-1>;
     * >   } RedeemResponse;
     *
     * From https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-voprf-21#section-3.3.1
     * > Finally, an entity which knows both the private key and the input can compute the PRF result
     * > using the Evaluate function described in Section 3.3.1.
     *
     * > Input:
     * >   Scalar skS
     * >   PrivateInput input
     * > Output:
     * >   opaque output[Nh]
     * > Parameters:
     * >   Group G
     * > Errors: InvalidInputError
     * >
     * > def Evaluate(skS, input):
     * >   inputElement = G.HashToGroup(input)
     * >   if inputElement == G.Identity():
     * >     raise InvalidInputError
     * >   evaluatedElement = skS * inputElement
     * >   issuedElement = G.SerializeElement(evaluatedElement)
     * >
     * >   hashInput = I2OSP(len(input), 2) || input ||
     * >               I2OSP(len(issuedElement), 2) || issuedElement ||
     * >               "Finalize"
     * >   return Hash(hashInput)
     *
     * From https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-voprf-21#section-2.1
     *
     * > HashToGroup(x): Deterministically maps an array of bytes x to an element of Group.
     * > The map must ensure that, for any adversary receiving R = HashToGroup(x), it is
     * > computationally difficult to reverse the mapping. This function is optionally parameterized
     * > by a domain separation tag (DST);
     *
     * From https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-voprf-21#section-4.4
     *
     * > HashToGroup(): Use hash_to_curve with suite P384_XMD:SHA-384_SSWU_RO_
     * > and DST = "HashToGroup-" || contextString.
     *
     * hash_to_curve is defined in https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve-16#section-3
     *
     * @param {RedeemRequest} request The redemption request.
     * @param {RedemptionRecord} redemptionRecord The redemption record.
     * @param {string} version The version of the protocol to use.
     * @returns {RedeemResponse} The redemption response.
     */
    redeem(request, redemptionRecord, version=PrivateStateTokenIssuer.DEFAULT_VERSION) {
        const config = PrivateStateTokenIssuer.getVersionConfig(version);

        const evaluatedElement = hashToCurve(Uint8Array.from(request.nonce), { DST: config.hashToGroupDST, hash: config.hash })
        const secretKey = this.#keys.get(request.keyID)?.secretKey;
        const issuedElement = evaluatedElement.multiply(secretKey?.scalar);

        if (request.point.toPoint().equals(issuedElement)) {
            return new RedeemResponse(redemptionRecord);
        }
        return null;
    }
}
