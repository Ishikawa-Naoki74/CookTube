#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CookTubeStack } from '../lib/cooktube-stack';

const app = new cdk.App();

new CookTubeStack(app, 'CookTubeStack', {
  env: {
    // 東京リージョンを使用
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  description: 'CookTube AWS Infrastructure',
});