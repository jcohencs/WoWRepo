import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../server/env';

describe('parseEnv', () => {
  it('reads what Notepad tends to produce', () => {
    const text = '﻿WCL_CLIENT_ID = "abc-123"\r\nwcl_client_secret: xyz \r\n# comment\r\nexport WCL_SITE=fresh\r\n';
    expect(parseEnv(text)).toEqual({ WCL_CLIENT_ID: 'abc-123', WCL_CLIENT_SECRET: 'xyz', WCL_SITE: 'fresh' });
  });
});
