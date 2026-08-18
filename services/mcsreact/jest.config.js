module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/__mocks__/fileMock.js',
    '^@mui/material$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@mui/material/index.js',
    '^@mui/material/(.*)$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@mui/material/$1',
    '^@mui/icons-material$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@mui/icons-material/index.js',
    '^@mui/icons-material/(.*)$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@mui/icons-material/$1',
    '^@mui/system$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@mui/system/index.js',
    '^@mui/lab$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@mui/lab/index.js',
    '^@mui/x-charts$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@mui/x-charts/index.js',
    '^@mui/x-date-pickers$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@mui/x-date-pickers/index.js',
    '^@emotion/react$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@emotion/react/index.js',
    '^@emotion/styled$': '/mnt/1tbHD/ckt_web/stage7/node_modules/@emotion/styled/index.js',
  },
  transform: {
    '^.+\.(ts|tsx)$': 'ts-jest',
  },
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)', '**/*.test.(ts|tsx)'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
};