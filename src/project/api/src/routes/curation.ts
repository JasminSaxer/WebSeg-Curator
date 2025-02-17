import { update } from "lodash";
import { getSource, getSources } from "../actions/commonActions";
import { getPage, postAnswer, deleteAnswer, getAnswersForDomain, updateBoundingBox } from "../actions/curationActions";
import { AppRoute } from "../types";

export const AppRoutes: AppRoute[] = [
  {
    path: '/curation/source',
    method: 'get',
    action: getSources
  },
  {
    path: '/curation/source/:name',
    method: 'get',
    action: getSource
  },
  {
    path: '/curation/page/:id',
    method: 'get',
    action: getPage
  },
  {
    path: '/curation/page/:id',
    method: 'post',
    action: postAnswer
  },
  {
    path: '/curation/page/:id',
    method: 'put',
    action: deleteAnswer
  },
  {
    path: '/curation/answer/:id',
    method: 'get',
    action: getAnswersForDomain
  },
  {
    path: '/curation/answer/:answer_id',
    method: 'post',
    action: updateBoundingBox
  }
]
